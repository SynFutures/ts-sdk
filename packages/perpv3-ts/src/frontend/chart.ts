import { formatUnits } from 'viem';
import { mulDivRoundingUp, tickToSqrtX96, wadToTick, tickToWad } from '../math';
import { ZERO } from '../constants';
import { MinimalPearl } from '../types';
import { DEFAULT_DECIMALS } from '../utils/format';
import { ChartLiquidityDetailsFromApi, DepthChartData, DepthData } from '../apis/interfaces';

// ============================================================================
// Helper Functions
// ============================================================================

const absBigInt = (value: bigint): bigint => (value < 0n ? -value : value);

function calcPage(currTick: number, tick: number, pageAdjustmentDelta: number, size: number, right: boolean): number {
    if (size <= 0) {
        return 0;
    }
    const adjustedCurrTick = currTick - pageAdjustmentDelta;
    const tmp = right ? tick - adjustedCurrTick : adjustedCurrTick - tick;
    if (tmp <= 0) {
        return 0;
    }
    return Math.ceil(tmp / size) - 1;
}

function calcDeltaBase(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint, roundUp: boolean): bigint {
    let sqrtLower = sqrtRatioAX96;
    let sqrtUpper = sqrtRatioBX96;
    if (sqrtLower > sqrtUpper) {
        [sqrtLower, sqrtUpper] = [sqrtUpper, sqrtLower];
    }
    const numerator1 = liquidity << 96n;
    const numerator2 = sqrtUpper - sqrtLower;
    if (roundUp) {
        const first = mulDivRoundingUp(numerator1, numerator2, sqrtUpper);
        return mulDivRoundingUp(first, 1n, sqrtLower);
    }
    return (numerator1 * numerator2) / sqrtUpper / sqrtLower;
}

// ============================================================================
// Main Functions
// ============================================================================

export function getDepthRangeDataByLiquidityDetails(
    liquidityDetails: ChartLiquidityDetailsFromApi,
    size: number,
    stepRatio: number,
    lowerPrice?: bigint,
    upperPrice?: bigint
): DepthData {
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
    // `pageAdjustmentDelta` aligns Level 0 to ORDER_SPACING so that every following level aggregates exactly `size` ticks.
    const ret: DepthChartData[] = [];
    const page2BaseQuantity = new Map<number, bigint>();
    const lastPageTick = new Map<number, number>();

    let currentLiquidity = currLiquidity;
    let currentPX96 = currPX96;

    for (let tick = currTick; right ? tick < currTick + tickDelta : tick > currTick - tickDelta; ) {
        const page = calcPage(currTick, tick, pageAdjustmentDelta, size, right);
        if (page >= length) {
            break;
        }

        if (tick === currTick) {
            // Handle current-tick residuals and resting limit orders, mirroring Oyster.swapCrossRange.
            let currBaseQuantity = page2BaseQuantity.get(page) ?? ZERO;
            const pearl = tick2Pearl.get(tick);
            if (pearl) {
                if ((right && pearl.left < 0n) || (!right && pearl.left > 0n)) {
                    currBaseQuantity += absBigInt(pearl.left);
                }
            }

            const boundaryTick = right ? tick + 1 : tick;
            const targetPX96 = tickToSqrtX96(boundaryTick);
            const deltaBase = calcDeltaBase(currentPX96, targetPX96, currentLiquidity, !right);
            currBaseQuantity += absBigInt(deltaBase);
            currentPX96 = targetPX96;

            // When walking bids (right=false), reaching `boundaryTick = currTick` means we will cross `currTick`
            // before moving further left. Apply liquidityNet at currTick so subsequent levels use correct liquidity,
            // matching Oyster.swapCrossRange tick-cross semantics.
            if (!right && pearl && pearl.liquidityNet !== 0n) {
                currentLiquidity = currentLiquidity - pearl.liquidityNet;
            }

            page2BaseQuantity.set(page, currBaseQuantity);
            lastPageTick.set(page, right ? boundaryTick : tick - 1);

            tick = right ? tick + 1 : tick - 1;
            continue;
        }

        let currBaseQuantity = page2BaseQuantity.get(page) ?? ZERO;
        lastPageTick.set(page, tick);

        const pearl = tick2Pearl.get(tick);
        if (pearl) {
            if ((right && pearl.left < 0n) || (!right && pearl.left > 0n)) {
                currBaseQuantity += absBigInt(pearl.left);
            }

            const targetPX96 = tickToSqrtX96(tick);
            currBaseQuantity += calcDeltaBase(currentPX96, targetPX96, currentLiquidity, false);
            currentPX96 = targetPX96;

            if (pearl.liquidityNet !== 0n) {
                currentLiquidity = right ? currentLiquidity + pearl.liquidityNet : currentLiquidity - pearl.liquidityNet;
            }

            page2BaseQuantity.set(page, currBaseQuantity);
        } else if (tick % size === 0) {
            const targetPX96 = tickToSqrtX96(tick);
            const deltaBase = calcDeltaBase(currentPX96, targetPX96, currentLiquidity, !right);
            currBaseQuantity += absBigInt(deltaBase);
            currentPX96 = targetPX96;
            page2BaseQuantity.set(page, currBaseQuantity);
        }

        tick = right ? tick + 1 : tick - 1;
    }

    for (const [page, baseQuantity] of page2BaseQuantity) {
        const tickValue = lastPageTick.get(page);
        if (tickValue === undefined) {
            continue;
        }
        const price = Number(formatUnits(tickToWad(tickValue), DEFAULT_DECIMALS));
        const base = Number(formatUnits(baseQuantity, DEFAULT_DECIMALS));
        ret.push({ tick: tickValue, price, base });
    }
    return ret;
}
