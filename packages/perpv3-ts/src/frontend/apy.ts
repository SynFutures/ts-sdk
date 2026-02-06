import { WAD, ZERO } from '../constants';
import { tickToSqrtX96, wdiv } from '../math';
import { Range, type Amm } from '../types';

export function estimateAPY(
    amm: Amm,
    poolFee24h: bigint,
    tickDelta: number,
    minRangeValue: bigint,
    initialMarginRatio: number,
    rangeSpacing: number
): number {
    if (!amm || amm.liquidity === ZERO || minRangeValue === ZERO) {
        return 0;
    }

    const assumeAddMargin = minRangeValue;
    const spacing = rangeSpacing;

    if (tickDelta <= 0 || spacing <= 0) {
        return 0;
    }

    const upperTick = spacing * Math.trunc((amm.tick + tickDelta) / spacing);
    const lowerTick = spacing * Math.trunc((amm.tick - tickDelta) / spacing);

    if (upperTick <= lowerTick) {
        return 0;
    }

    const sqrtUpperPX96 = tickToSqrtX96(upperTick);
    const sqrtLowerPX96 = tickToSqrtX96(lowerTick);
    if (amm.sqrtPX96 <= sqrtLowerPX96 || amm.sqrtPX96 >= sqrtUpperPX96) {
        return 0;
    }

    const tempRange = new Range(0n, 0n, 0n, amm.sqrtPX96, lowerTick, upperTick);
    const { liquidity: assumeAddLiquidity } = tempRange.calcEntryDelta(amm.sqrtPX96, assumeAddMargin, initialMarginRatio);

    const assumed24HrFee = (poolFee24h * assumeAddLiquidity) / amm.liquidity;
    const apyWad = wdiv(assumed24HrFee * 365n, assumeAddMargin);

    // Convert from WAD (18 decimals) to number
    return Number(apyWad) / Number(WAD);
}
