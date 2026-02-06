import { formatUnits } from 'viem';
import { alphaWadToTickDelta, tickToSqrtX96 } from '../math';
import { WAD } from '../constants';
import { Errors, ErrorCode, PairSnapshot, Range } from '../types';
import { DEFAULT_DECIMALS } from '../utils/format';

export interface SimulateImpermanentLossParams {
    alphaWadLower: bigint;
    alphaWadUpper: bigint;
    /**
     * Initial margin (in WAD) used to construct the simulated range.
     * Default: 1 WAD.
     */
    margin?: bigint;
}

export interface SimulateImpermanentLossResult {
    tick: number;
    impermanentLoss: number;
}

/**
 * Simulate impermanent loss for a hypothetical liquidity range centered around the current AMM tick.
 *
 * This mirrors the legacy SDK behavior:
 * - Builds a range using a fixed `margin` and the current AMM sqrt price as entry price.
 * - Sweeps price across ticks inside [tickLower, tickUpper) with step `orderSpacing`.
 * - Computes impermanent loss as `removedBalance / margin - 1` at each tick.
 */
export function simulateImpermanentLoss(
    snapshot: PairSnapshot,
    params: SimulateImpermanentLossParams
): SimulateImpermanentLossResult[] {
    const { amm, instrumentSetting } = snapshot;

    if (params.alphaWadLower <= 0n || params.alphaWadUpper <= 0n) {
        throw Errors.validation('alphaWadLower/alphaWadUpper must be positive', ErrorCode.INVALID_PARAM, {
            alphaWadLower: params.alphaWadLower.toString(),
            alphaWadUpper: params.alphaWadUpper.toString(),
        });
    }

    const margin = params.margin ?? WAD;
    if (margin <= 0n) {
        throw Errors.validation('margin must be positive', ErrorCode.INVALID_AMOUNT, { margin: margin.toString() });
    }

    const tickDeltaLower = alphaWadToTickDelta(params.alphaWadLower);
    const tickDeltaUpper = alphaWadToTickDelta(params.alphaWadUpper);

    const tickUpper = instrumentSetting.alignRangeTickUpper(amm.tick + tickDeltaUpper);
    const tickLower = instrumentSetting.alignRangeTickLower(amm.tick - tickDeltaLower);

    if (tickUpper <= tickLower) {
        throw Errors.validation('Invalid range derived from alphaWadLower/alphaWadUpper', ErrorCode.INVALID_TICK, {
            tickLower,
            tickUpper,
            ammTick: amm.tick,
        });
    }
    if (instrumentSetting.orderSpacing <= 0) {
        throw Errors.validation('orderSpacing must be positive', ErrorCode.MISSING_SPACING, {
            orderSpacing: instrumentSetting.orderSpacing,
        });
    }

    const tempRange = new Range(0n, 0n, 0n, amm.sqrtPX96, tickLower, tickUpper);
    const { liquidity } = tempRange.calcEntryDelta(amm.sqrtPX96, margin, instrumentSetting.imr);

    const simulationRange = new Range(liquidity, amm.feeIndex, margin, amm.sqrtPX96, tickLower, tickUpper);

    const results: SimulateImpermanentLossResult[] = [];
    const initialMarginNumber = Number(formatUnits(margin, DEFAULT_DECIMALS));
    const step = instrumentSetting.orderSpacing;

    for (let tick = tickLower; tick < tickUpper; tick += step) {
        const removedBalance = simulationRange.toPosition({ ...amm, tick, sqrtPX96: tickToSqrtX96(tick) }).balance;
        const removedBalanceNumber = Number(formatUnits(removedBalance, DEFAULT_DECIMALS));

        results.push({
            tick,
            impermanentLoss: removedBalanceNumber / initialMarginNumber - 1,
        });
    }

    return results;
}
