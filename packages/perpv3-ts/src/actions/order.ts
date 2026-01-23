import type { Address } from 'viem';
import { abs } from '../math';
import { Errors, ErrorCode, Order, PairSnapshot, Side, sideSign, UserSetting, type PlaceParam } from '../types';

export class PlaceInput {
    public readonly traderAddress: Address;

    public readonly tick: number;
    public readonly baseQuantity: bigint; // unsigned base quantity
    public readonly side: Side; // LONG or SHORT

    constructor(traderAddress: Address, tick: number, baseQuantity: bigint, side: Side) {
        if (baseQuantity <= 0n) {
            throw Errors.validation('Order baseQuantity must be positive', ErrorCode.INVALID_SIZE, {
                baseQuantity: baseQuantity.toString(),
            });
        }

        this.traderAddress = traderAddress;
        this.tick = tick;
        this.baseQuantity = baseQuantity;
        this.side = side;
    }

    /**
     * Simulate this limit order with full validation and parameter conversion.
     * Handles all validation, parameter conversion, and simulation in one call.
     *
     * @param snapshot - Pair snapshot (must include portfolio and priceData.markPrice)
     * @param userSetting - User settings (leverage, deadline, etc.)
     * @returns Tuple of [validated PlaceParam, simulation result]
     */
    simulate(snapshot: PairSnapshot, userSetting: UserSetting): [PlaceParam, PlaceSimulation] {
        const { instrumentSetting } = snapshot;
        const markPrice = snapshot.priceData.markPrice;

        // Validate leverage (baseQuantity validation is done in constructor)
        userSetting.validateLeverage(instrumentSetting.maxLeverage);

        // Calculate required margin based on leverage
        // Since leverage is validated to be <= maxLeverage, and maxLeverage = 10000 / IMR,
        // the leverage-based margin will always satisfy IMR requirements
        // Use markPriceBufferInBps to account for mark price changes (mark price changes every second by design)
        const signedSize = abs(this.baseQuantity) * BigInt(sideSign(this.side));
        const tempOrder = new Order(0n, signedSize, this.tick, 0);
        const requiredMargin = tempOrder.marginForLeverage(
            markPrice,
            userSetting.leverage,
            userSetting.markPriceBufferInBps
        );

        // Convert to PlaceParam
        const placeParam: PlaceParam = {
            expiry: snapshot.expiry,
            tick: this.tick,
            size: signedSize,
            amount: requiredMargin,
            deadline: userSetting.getDeadline(snapshot.blockInfo.timestamp),
        };

        // Validate PlaceParam with full context (includes minimum order value check)
        snapshot.validatePlaceParam(placeParam);

        // Create Order instance with final parameters for convenience
        const order = new Order(placeParam.amount, placeParam.size, placeParam.tick, 0);

        const simulation: PlaceSimulation = {
            order,
        };

        return [placeParam, simulation];
    }
}

/**
 * Simulation result for PlaceInput.
 * Contains the expected Order object for convenience.
 *
 * To derive other values:
 * - `minFeeRebate`: `wmulDown(simulation.order.value, ratioToWad(instrumentSetting.orderFeeRebateRatio))`
 * - `minOrderSize`: `instrumentSetting.minOrderSizeAtTick(placeParam.tick)`
 * - `canPlaceOrder`: `abs(placeParam.size) >= instrumentSetting.minOrderSizeAtTick(placeParam.tick)`
 * - `tick`: `placeParam.tick` or `simulation.order.tick`
 * - `limitPrice`: `simulation.order.targetPrice`
 * - `baseQuantity`: `abs(placeParam.size)` or `abs(simulation.order.size)`
 * - `margin`: `placeParam.amount` or `simulation.order.balance`
 * - `tradeValue`: `simulation.order.value`
 */
export interface PlaceSimulation {
    order: Order;
}
