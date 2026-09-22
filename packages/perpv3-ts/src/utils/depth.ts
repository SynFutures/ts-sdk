import { mulDivRoundingUp, tickToSqrtX96, tickToWad } from '../math';
import { ZERO } from '../constants';
import type { MinimalPearl } from '../types';

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

export function buildDepthLevels(
    currPX96: bigint,
    currLiquidity: bigint,
    currTick: number,
    tickDelta: number,
    tick2Pearl: Map<number, MinimalPearl>,
    size: number,
    length: number,
    pageAdjustmentDelta: number,
    right: boolean
): { tick: number; price: bigint; baseQuantity: bigint }[] {
    if (size <= 0 || tickDelta <= 0 || length <= 0) return [];
    const ret: { tick: number; price: bigint; baseQuantity: bigint }[] = [];
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
                currentLiquidity = right
                    ? currentLiquidity + pearl.liquidityNet
                    : currentLiquidity - pearl.liquidityNet;
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
        const tick = lastPageTick.get(page);
        if (tick !== undefined) ret.push({ tick, price: tickToWad(tick), baseQuantity });
    }
    return ret;
}
