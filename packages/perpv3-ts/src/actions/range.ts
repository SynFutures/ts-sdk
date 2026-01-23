import type { Address } from 'viem';
import {
    Errors,
    ErrorCode,
    Position,
    Range,
    UserSetting,
    type AddParam,
    type PairSnapshot,
    type RemoveParam,
} from '../types';

// ============================================================================
// Range Input Classes
// ============================================================================

export class AddInput {
    public readonly traderAddress: Address;
    public readonly marginAmount: bigint;
    public readonly tickLower: number;
    public readonly tickUpper: number;

    constructor(traderAddress: Address, marginAmount: bigint, tickLower: number, tickUpper: number) {
        this.traderAddress = traderAddress;
        this.marginAmount = marginAmount;
        this.tickLower = tickLower;
        this.tickUpper = tickUpper;
    }

    /**
     * Simulate adding liquidity with full validation and parameter conversion.
     * Handles all validation, parameter conversion, and simulation in one call.
     *
     * @param snapshot - Pair snapshot (must include amm)
     * @param userSetting - User settings (deadline, slippage, etc.)
     * @returns Tuple of [validated AddParam, simulation result]
     */
    simulate(snapshot: PairSnapshot, userSetting: UserSetting): [AddParam, AddSimulation] {
        const { instrumentSetting } = snapshot;

        // Check if adding liquidity is allowed
        const allowAdd = snapshot.isAddLiquidityAllowed();
        if (!allowAdd.allowed) {
            throw Errors.simulation(allowAdd.reason || 'Instrument not tradable', ErrorCode.SIMULATION_FAILED);
        }

        const ammForAdd = snapshot.getAmmForAddLiquidity();

        // Validate margin amount
        if (this.marginAmount <= 0n) {
            throw Errors.validation('Margin amount must be positive', ErrorCode.INVALID_SIZE, {
                amount: this.marginAmount.toString(),
            });
        }

        // Validate range tick pair (includes bounds, spacing, side constraints, and IMR restrictions)
        if (!instrumentSetting.isRangeTickPairValid(this.tickLower, this.tickUpper, ammForAdd.tick)) {
            throw Errors.validation('Invalid range tick pair', ErrorCode.INVALID_TICK, {
                tickLower: this.tickLower,
                tickUpper: this.tickUpper,
                ammTick: ammForAdd.tick,
            });
        }

        const imr = instrumentSetting.imr;

        // Align ticks to range spacing
        const upperTick = instrumentSetting.alignRangeTickUpper(this.tickUpper);
        const lowerTick = instrumentSetting.alignRangeTickLower(this.tickLower);

        // Create a temporary Range instance to use its methods
        const tempRange = new Range(0n, 0n, 0n, ammForAdd.sqrtPX96, lowerTick, upperTick);
        const { liquidity } = tempRange.calcEntryDelta(ammForAdd.sqrtPX96, this.marginAmount, imr);

        const rangeWithTicks = new Range(
            liquidity,
            ammForAdd.feeIndex,
            this.marginAmount,
            ammForAdd.sqrtPX96,
            lowerTick,
            upperTick
        );

        const simulation: AddSimulation = {
            range: rangeWithTicks,
        };

        const tickDeltaLower = Math.abs(lowerTick - ammForAdd.tick);
        const tickDeltaUpper = Math.abs(upperTick - ammForAdd.tick);

        const addParam: AddParam = {
            expiry: snapshot.expiry,
            tickDeltaLower,
            tickDeltaUpper,
            amount: this.marginAmount,
            limitTicks: Number(userSetting.getEncodedLiquidityLimitTicks(ammForAdd.sqrtPX96)),
            deadline: userSetting.getDeadline(snapshot.blockInfo.timestamp),
        };

        // Note: Validation is done above using original ticks before converting to deltas
        // This is necessary because deltas lose direction information (they're absolute values)

        return [addParam, simulation];
    }
}

export class RemoveInput {
    public readonly traderAddress: Address;
    public readonly tickLower: number;
    public readonly tickUpper: number;

    constructor(traderAddress: Address, tickLower: number, tickUpper: number) {
        this.traderAddress = traderAddress;
        this.tickLower = tickLower;
        this.tickUpper = tickUpper;
    }

    /**
     * Simulate removing liquidity with full validation and parameter conversion.
     * Handles all validation, parameter conversion, and simulation in one call.
     *
     * @param snapshot - Pair snapshot (must include portfolio and amm)
     * @param userSetting - User settings (deadline, slippage, etc.)
     * @returns Tuple of [validated RemoveParam, simulation result]
     */
    simulate(snapshot: PairSnapshot, userSetting: UserSetting): [RemoveParam, RemoveSimulation] {
        const { instrumentSetting, amm, portfolio } = snapshot;

        // Validate basic constraints first
        if (this.tickLower >= this.tickUpper) {
            throw Errors.validation('tickLower must be less than tickUpper', ErrorCode.INVALID_TICK, {
                tickLower: this.tickLower,
                tickUpper: this.tickUpper,
            });
        }
        if (
            this.tickLower % instrumentSetting.rangeSpacing !== 0 ||
            this.tickUpper % instrumentSetting.rangeSpacing !== 0
        ) {
            throw Errors.validation(
                `Ticks must be multiples of range spacing ${instrumentSetting.rangeSpacing}`,
                ErrorCode.INVALID_TICK,
                {
                    tickLower: this.tickLower,
                    tickUpper: this.tickUpper,
                    rangeSpacing: instrumentSetting.rangeSpacing,
                }
            );
        }

        // Check if removing liquidity is feasible (checks tradability and range existence)
        const feasibility = snapshot.isRemoveLiquidityFeasible(this.tickLower, this.tickUpper);
        if (!feasibility.feasible) {
            throw Errors.simulation(
                feasibility.reason || `Range not found for tickLower: ${this.tickLower}, tickUpper: ${this.tickUpper}`,
                ErrorCode.SIMULATION_FAILED,
                { tickLower: this.tickLower, tickUpper: this.tickUpper }
            );
        }

        // Find range by matching tickLower and tickUpper
        let foundRange: Range | undefined;
        for (let i = 0; i < portfolio.ranges.length; i++) {
            const rid = portfolio.rids[i];
            if (rid === undefined) continue;
            const { tickLower, tickUpper } = Range.unpackKey(rid);
            if (tickLower === this.tickLower && tickUpper === this.tickUpper) {
                foundRange = portfolio.ranges[i];
                break;
            }
        }

        // This should never happen if isRemoveLiquidityFeasible passed, but keep as safety check
        if (!foundRange) {
            throw Errors.simulation(
                `Range not found for tickLower: ${this.tickLower}, tickUpper: ${this.tickUpper}`,
                ErrorCode.SIMULATION_FAILED,
                { tickLower: this.tickLower, tickUpper: this.tickUpper }
            );
        }

        // foundRange is already a Range instance with ticks, so we can use it directly
        const rangeWithTicks = foundRange;
        const removedPosition = rangeWithTicks.toPosition(amm);
        const postPosition = Position.combine(amm, removedPosition, portfolio.position).position;

        const simulation: RemoveSimulation = {
            removedPosition: removedPosition,
            postPosition: postPosition,
        };

        const removeParam: RemoveParam = {
            expiry: snapshot.expiry,
            target: this.traderAddress,
            tickLower: this.tickLower,
            tickUpper: this.tickUpper,
            limitTicks: Number(userSetting.getEncodedLiquidityLimitTicks(amm.sqrtPX96)),
            deadline: userSetting.getDeadline(snapshot.blockInfo.timestamp),
        };

        return [removeParam, simulation];
    }
}

// ============================================================================
// Range Result Types
// ============================================================================

export interface AddSimulation {
    range: Range;
}

export interface RemoveSimulation {
    removedPosition: Position;
    postPosition: Position;
}
