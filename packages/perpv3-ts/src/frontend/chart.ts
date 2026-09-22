import { formatUnits } from 'viem';
import { wadToTick, tickToWad } from '../math';
import { buildDepthLevels } from '../utils/depth';
import { MinimalPearl } from '../types';
import { DEFAULT_DECIMALS } from '../utils/format';
import { ChartLiquidityDetailsFromApi, DepthChartData, DepthData } from '../apis/interfaces';

export function getDepthRangeDataByLiquidityDetails(
    liquidityDetails: ChartLiquidityDetailsFromApi,
    size: number,
    stepRatio: number,
    lowerPrice?: bigint,
    upperPrice?: bigint
): DepthData {
    if (liquidityDetails.tids.length === 0) return { left: [], right: [] };
    if (!Number.isSafeInteger(size) || size <= 0 || !Number.isSafeInteger(stepRatio) || stepRatio <= 0) {
        throw new Error('Depth size and stepRatio must be positive integers');
    }
    let pageAdjustmentDelta = 0;
    if (liquidityDetails.amm.tick % size !== 0) {
        pageAdjustmentDelta =
            liquidityDetails.amm.tick > 0
                ? liquidityDetails.amm.tick % size
                : size - (-liquidityDetails.amm.tick % size);
    }

    const maxTick = Math.max(...liquidityDetails.tids);
    const minTick = Math.min(...liquidityDetails.tids);
    const bnMin = (left: bigint, right: bigint): bigint => (left > right ? right : left);
    const minPriceDelta = bnMin(
        tickToWad(Number(maxTick)) - tickToWad(liquidityDetails.amm.tick),
        tickToWad(liquidityDetails.amm.tick) - tickToWad(minTick)
    );
    const rightTickDelta = upperPrice
        ? wadToTick(upperPrice) - liquidityDetails.amm.tick
        : wadToTick(tickToWad(liquidityDetails.amm.tick) + minPriceDelta) - liquidityDetails.amm.tick;
    const rightLength = Number((tickToWad(rightTickDelta) / 10n ** 14n / BigInt(stepRatio)).toString());
    const right: DepthChartData[] = buildDepthChartData(
        liquidityDetails.amm.sqrtPX96,
        liquidityDetails.amm.liquidity,
        liquidityDetails.amm.tick,
        rightTickDelta,
        liquidityDetails.tick2Pearl,
        size,
        rightLength,
        pageAdjustmentDelta,
        true
    );
    const leftTickDelta = lowerPrice
        ? liquidityDetails.amm.tick - wadToTick(lowerPrice)
        : liquidityDetails.amm.tick - wadToTick(tickToWad(liquidityDetails.amm.tick) - minPriceDelta);
    const leftLength = Number((tickToWad(leftTickDelta) / 10n ** 14n / BigInt(stepRatio)).toString());
    const left: DepthChartData[] = buildDepthChartData(
        liquidityDetails.amm.sqrtPX96,
        liquidityDetails.amm.liquidity,
        liquidityDetails.amm.tick,
        leftTickDelta,
        liquidityDetails.tick2Pearl,
        size,
        leftLength,
        pageAdjustmentDelta,
        false
    );
    return { left, right };
}

export function buildDepthChartData(
    currPX96: bigint,
    currLiquidity: bigint,
    currTick: number,
    tickDelta: number,
    tick2Pearl: Map<number, MinimalPearl>,
    size: number,
    length: number,
    pageAdjustmentDelta: number,
    right: boolean
): DepthChartData[] {
    return buildDepthLevels(
        currPX96,
        currLiquidity,
        currTick,
        tickDelta,
        tick2Pearl,
        size,
        length,
        pageAdjustmentDelta,
        right
    ).map((level) => ({
        tick: level.tick,
        price: Number(formatUnits(level.price, DEFAULT_DECIMALS)),
        base: Number(formatUnits(level.baseQuantity, DEFAULT_DECIMALS)),
    }));
}
