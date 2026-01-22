import type { Address } from 'viem';
import { abs } from '../math';
import { ZERO } from '../constants';
import { Errors, ErrorCode, Position, UserSetting, type AdjustParam, type PairSnapshot } from '../types';

// ============================================================================
// Adjust Input Classes
// ============================================================================

/**
 * Unified input class for margin and leverage adjustments.
 * Supports two modes:
 * - Margin adjustment: Provide `amount` and `transferIn` to adjust by a specific margin amount
 * - Leverage adjustment: Omit `amount` and `transferIn` to adjust to target leverage from `userSetting.leverage`
 */
export class AdjustInput {
    public readonly traderAddress: Address;

    public readonly amount?: bigint;
    public readonly transferIn?: boolean;

    constructor(traderAddress: Address, amount?: bigint, transferIn?: boolean) {
        this.traderAddress = traderAddress;
        this.amount = amount;
        this.transferIn = transferIn;

        // Validate that if amount is provided, transferIn must also be provided
        if (amount !== undefined && transferIn === undefined) {
            throw Errors.validation('transferIn must be provided when amount is specified', ErrorCode.INVALID_PARAM);
        }
    }

    /**
     * Simulate adjusting margin or leverage with full validation and parameter conversion.
     * Handles all validation, parameter conversion, and simulation in one call.
     *
     * Mode 1 (Margin adjustment): When `amount` and `transferIn` are provided, adjusts margin by the specified amount.
     * Mode 2 (Leverage adjustment): When `amount` is omitted, adjusts margin to achieve `userSetting.leverage`.
     *
     * @param snapshot - Pair snapshot (must include portfolio, amm, and priceData.markPrice)
     * @param userSetting - User settings (leverage, deadline, etc.)
     * @returns Tuple of [validated AdjustParam, simulation result]
     */
    simulate(snapshot: PairSnapshot, userSetting: UserSetting): [AdjustParam, AdjustSimulation] {
        const { instrumentSetting, amm, portfolio } = snapshot;
        const markPrice = snapshot.priceData.markPrice;
        const position = Position.ensureInstance(portfolio.position);

        // Check if instrument is tradable
        const tradability = snapshot.isTradable();
        if (!tradability.tradable) {
            throw Errors.simulation(tradability.reason || 'Instrument not tradable', ErrorCode.SIMULATION_FAILED);
        }

        const imr = instrumentSetting.initialMarginRatio;

        let marginDelta: bigint;

        if (this.amount !== undefined) {
            // Mode 1: Margin adjustment by amount
            if (this.amount <= 0n) {
                throw Errors.validation('Margin amount must be positive', ErrorCode.INVALID_SIZE, {
                    amount: this.amount.toString(),
                });
            }
            // transferIn is guaranteed to be defined when amount is provided (validated in constructor)
            marginDelta = this.transferIn ? this.amount : -this.amount;

            if (!this.transferIn) {
                this.validateWithdrawal(snapshot, position, marginDelta);
            }
        } else {
            // Mode 2: Leverage adjustment
            userSetting.validateLeverage(instrumentSetting.maxLeverage);

            // Check if leverage adjustment is feasible
            if (!position.canAdjustToLeverage(userSetting.leverage, amm, markPrice, imr)) {
                throw Errors.simulation('Cannot adjust to target leverage', ErrorCode.SIMULATION_FAILED);
            }

            marginDelta = position.transferAmountFromTargetLeverage(amm, userSetting.leverage, markPrice);

            if (marginDelta < ZERO && position.size !== ZERO) {
                this.validateWithdrawal(snapshot, position, marginDelta, 'leverage adjustment');
            }
        }

        const postPosition = position.withBalanceDelta(marginDelta);

        const adjustParam: AdjustParam = {
            expiry: snapshot.expiry,
            net: marginDelta,
            deadline: userSetting.getDeadline(snapshot.blockInfo.timestamp),
        };

        const simulation: AdjustSimulation = {
            postPosition,
        };

        return [adjustParam, simulation];
    }

    /**
     * Validate withdrawal amount against maximum withdrawable margin.
     * Throws if withdrawal exceeds limits.
     */
    private validateWithdrawal(
        snapshot: PairSnapshot,
        position: Position,
        marginDelta: bigint,
        context: string = 'margin adjustment'
    ): void {
        // Check if withdrawal is allowed (fair price deviation check)
        const withdrawalCheck = snapshot.isWithdrawalAllowed();
        if (!withdrawalCheck.allowed) {
            throw Errors.validation(withdrawalCheck.reason || 'Withdrawal not allowed', ErrorCode.INVALID_PARAM);
        }

        if (position.size !== ZERO) {
            const maxWithdrawable = snapshot.getMaxWithdrawableMargin();
            const absMargin = abs(marginDelta);
            if (absMargin > maxWithdrawable) {
                throw Errors.simulation(
                    `Withdrawal for ${context} exceeds maximum withdrawable margin`,
                    ErrorCode.SIMULATION_FAILED
                );
            }
        }
    }
}

/**
 * Simulation result for margin and leverage adjustments.
 * Contains the position state after the adjustment.
 *
 * All derived values can be computed from postPosition:
 * - positionMargin: postPosition.balance
 * - leverage: postPosition.leverage(amm, markPrice)
 * - liquidationPrice: postPosition.liquidationPrice(amm, maintenanceMarginRatio)
 * - marginDelta: available in AdjustParam.net
 * - transferIn: AdjustParam.net >= ZERO
 */
export interface AdjustSimulation {
    /** Position state after the margin/leverage adjustment */
    postPosition: Position;
}
