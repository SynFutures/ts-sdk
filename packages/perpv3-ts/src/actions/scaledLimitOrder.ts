import type { Address } from 'viem';
import { max, tickToWad, wadToTick, wdivUp, wmulUp } from '../math';
import { MAX_BATCH_ORDER_COUNT, MIN_BATCH_ORDER_COUNT, RATIO_BASE, ZERO } from '../constants';
import { Errors, ErrorCode, PairSnapshot, Side, UserSetting, type PlaceParam } from '../types';
import { PlaceInput, type PlaceSimulation } from './order';

// ============================================================================
// Scaled Limit Order
// ============================================================================

export type ScaledOrderLevels =
    { ticks: readonly number[]; pricesWad?: never } | { pricesWad: readonly bigint[]; ticks?: never };

export class ScaledLimitOrderInput {
    public readonly traderAddress: Address;

    public readonly side: Side;
    public readonly baseQuantity: bigint;
    public readonly ticks: readonly number[];
    public readonly sizeDistribution: BatchOrderSizeDistribution;

    constructor(
        traderAddress: Address,
        side: Side,
        baseQuantity: bigint,
        levels: ScaledOrderLevels,
        sizeDistribution: BatchOrderSizeDistribution
    ) {
        if (baseQuantity <= 0n) {
            throw Errors.validation('baseQuantity must be positive', ErrorCode.INVALID_SIZE, {
                baseQuantity: baseQuantity.toString(),
            });
        }
        if (levels.ticks && levels.pricesWad) throw Errors.encoding('Supply either ticks or pricesWad');
        const ticks = levels.ticks ?? levels.pricesWad.map(wadToTick);
        if (ticks.length < MIN_BATCH_ORDER_COUNT || ticks.length > MAX_BATCH_ORDER_COUNT) {
            throw Errors.validation(
                `priceInfo length must be between ${MIN_BATCH_ORDER_COUNT} and ${MAX_BATCH_ORDER_COUNT}`,
                ErrorCode.INVALID_PARAM,
                { length: ticks.length }
            );
        }

        this.traderAddress = traderAddress;
        this.side = side;
        this.baseQuantity = baseQuantity;
        this.ticks = [...ticks];
        this.sizeDistribution = sizeDistribution;
    }

    simulate(snapshot: PairSnapshot, userSetting: UserSetting): ScaledLimitOrderSimulation {
        const { instrumentSetting } = snapshot;

        // Validate leverage
        userSetting.validateLeverage(instrumentSetting.maxLeverage);

        const alignedTicks = this.ticks.map((tick) => instrumentSetting.alignOrderTick(tick));

        // Calculate minOrderSizes directly using tickToWad for efficiency
        const minOrderSizes = alignedTicks.map((tick) => wdivUp(instrumentSetting.minOrderValue, tickToWad(tick)));

        // Determine ratios based on size distribution
        // For RANDOM distribution, fallback to FLAT if sizes violate minimum constraints
        const ratios = this.calcRatios(alignedTicks.length, minOrderSizes);

        const orders: (ScaledOrderDetail | null)[] = [];
        const portionSizes = ratios.map((ratio) => (this.baseQuantity * BigInt(ratio)) / BigInt(RATIO_BASE));

        for (let i = 0; i < alignedTicks.length; i++) {
            const basePortion = portionSizes[i];
            const tick = alignedTicks[i];

            if (basePortion === ZERO) {
                orders.push(null);
                continue;
            }

            try {
                const placeInput = new PlaceInput(this.traderAddress, tick, basePortion, this.side);

                const [placeParam, simulation] = placeInput.simulate(snapshot, userSetting);

                orders.push({
                    ratio: ratios[i],
                    param: placeParam,
                    simulation,
                });
            } catch {
                // Order simulation failed (e.g., validation error, insufficient margin)
                // Skip this order slot but continue with others
                orders.push(null);
            }
        }

        // Calculate minimum size ratios: ratio of minOrderSize to portionSize for each order
        // This determines the scaling factor needed to satisfy minimum size constraints
        const minSizeRatios = minOrderSizes.map((minSize, index) => {
            const portion = portionSizes[index];
            if (portion === ZERO) {
                return ZERO;
            }
            return wdivUp(minSize, portion);
        });

        // Find the maximum ratio - this determines the minimum base quantity required
        // to ensure all orders meet their minimum size constraints
        const maxRatio = minSizeRatios.reduce((acc, value) => max(acc, value), ZERO);
        const minBaseQuantity = maxRatio === ZERO ? ZERO : wmulUp(this.baseQuantity, maxRatio);
        const result: ScaledLimitOrderSimulation = {
            orders,
            minBase: minBaseQuantity,
        };

        return result;
    }

    /**
     * Calculate order size ratios based on distribution strategy.
     * For RANDOM distribution, falls back to FLAT if tentative ratios violate minimum size constraints.
     */
    private calcRatios(orderCount: number, minOrderSizes: bigint[]): number[] {
        if (this.sizeDistribution === BatchOrderSizeDistribution.RANDOM) {
            const tentativeRatios = generateBatchOrderRatios(this.sizeDistribution, orderCount);
            const tentativeSizes = tentativeRatios.map(
                (ratio) => (this.baseQuantity * BigInt(ratio)) / BigInt(RATIO_BASE)
            );
            const violates = tentativeSizes.some((size, index) => size < minOrderSizes[index]);
            const minTotal = minOrderSizes.reduce((sum, size) => sum + size, ZERO);
            return violates && minTotal < this.baseQuantity
                ? generateBatchOrderRatios(BatchOrderSizeDistribution.FLAT, orderCount)
                : tentativeRatios;
        }
        return generateBatchOrderRatios(this.sizeDistribution, orderCount);
    }
}

export interface ScaledOrderDetail {
    ratio: number;
    param: PlaceParam;
    simulation: PlaceSimulation;
    /**
     * Note: minOrderSize can be derived from `instrumentSetting.minOrderSizeAtTick(param.tick)`
     */
}

export interface ScaledLimitOrderSimulation {
    orders: (ScaledOrderDetail | null)[];
    /**
     * Minimum base quantity required to ensure all orders meet their minimum size constraints.
     *
     * Each order has a minimum order size requirement based on its tick price and the instrument's
     * minOrderValue setting. This field represents the minimum total baseQuantity that must be used
     * to ensure every order in the batch meets its individual minimum size requirement.
     *
     * To derive aggregated values:
     * - `totalBase`: Use the input `baseQuantity` (it's the same value)
     * - `totalQuote`: `orders.reduce((sum, order) => sum + (order ? order.simulation.order.value : 0n), 0n)`
     * - `totalMargin`: `orders.reduce((sum, order) => sum + (order ? order.param.amount : 0n), 0n)`
     */
    minBase: bigint;
}

// ============================================================================
// Batch Order Size Distribution
// ============================================================================

const RANDOM_SPREAD = 0.05;

export enum BatchOrderSizeDistribution {
    FLAT = 'FLAT',
    UPPER = 'UPPER',
    LOWER = 'LOWER',
    RANDOM = 'RANDOM',
}

/**
 * Generate ratios for batch orders based on size distribution strategy.
 * Ratios sum up to {@link RATIO_BASE}.
 */
export function generateBatchOrderRatios(sizeDistribution: BatchOrderSizeDistribution, orderCount: number): number[] {
    if (!Number.isSafeInteger(orderCount)) {
        throw Errors.validation('orderCount must be a safe integer', ErrorCode.INVALID_PARAM, { orderCount });
    }
    if (orderCount <= 0) {
        throw Errors.validation('orderCount must be positive', ErrorCode.INVALID_PARAM, { orderCount });
    }
    // batchPlace() supports up to 9 orders, and ScaledLimitOrderInput enforces the same constraint.
    // Keeping this bound here prevents accidental huge allocations and avoids invalid RANDOM distributions
    // (e.g., negative ratios when orderCount is very large).
    if (orderCount > MAX_BATCH_ORDER_COUNT) {
        throw Errors.validation(`orderCount must be between 1 and ${MAX_BATCH_ORDER_COUNT}`, ErrorCode.INVALID_PARAM, {
            orderCount,
            maxOrderCount: MAX_BATCH_ORDER_COUNT,
        });
    }

    switch (sizeDistribution) {
        case BatchOrderSizeDistribution.FLAT:
            return generateFlatRatios(orderCount);
        case BatchOrderSizeDistribution.UPPER:
            return generateWeightedRatios(orderCount, (index) => index + 1);
        case BatchOrderSizeDistribution.LOWER:
            return generateWeightedRatios(orderCount, (index) => orderCount - index);
        case BatchOrderSizeDistribution.RANDOM:
            return generateRandomRatios(orderCount);
        default:
            throw Errors.validation(
                `Invalid batch order size distribution: ${sizeDistribution}`,
                ErrorCode.INVALID_PARAM,
                { sizeDistribution }
            );
    }
}

/**
 * Generate flat ratios where each order gets an equal share.
 * The remainder from division is added to the last ratio to ensure sum equals RATIO_BASE.
 */
function generateFlatRatios(orderCount: number): number[] {
    const baseRatio = Math.floor(RATIO_BASE / orderCount);
    const remainder = RATIO_BASE - baseRatio * orderCount;
    const ratios = Array(orderCount).fill(baseRatio);
    ratios[orderCount - 1] += remainder;
    return ratios;
}

/**
 * Generate weighted ratios based on a weight function.
 * Ratios are proportional to weights, with remainder added to the last ratio.
 */
function generateWeightedRatios(orderCount: number, weightFn: (index: number) => number): number[] {
    const weights = Array.from({ length: orderCount }, (_, index) => weightFn(index));
    const sum = weights.reduce((acc, weight) => acc + weight, 0);
    if (sum === 0) {
        // If total weight is zero, it's impossible to distribute weighted ratios.
        // This can happen if weightFn returns 0 for all inputs.
        // Fall back to a flat distribution as a sensible default.
        return generateFlatRatios(orderCount);
    }
    let totalRatio = 0;
    const ratios = weights.map((weight) => {
        const ratio = Math.floor((weight * RATIO_BASE) / sum);
        totalRatio += ratio;
        return ratio;
    });
    // Add remainder to last ratio to ensure sum equals RATIO_BASE
    ratios[orderCount - 1] += RATIO_BASE - totalRatio;
    return ratios;
}

/**
 * Generate random ratios within RANDOM_SPREAD of the average.
 * Ratios are adjusted to sum to RATIO_BASE while respecting min/max bounds.
 */
function generateRandomRatios(orderCount: number): number[] {
    const average = RATIO_BASE / orderCount;
    const minRatio = Math.ceil(average * (1 - RANDOM_SPREAD));
    const maxRatio = Math.floor(average * (1 + RANDOM_SPREAD));
    const ratios: number[] = [];

    for (let i = 0; i < orderCount; i++) {
        const ratio = Math.floor(average * (1 - RANDOM_SPREAD + Math.random() * RANDOM_SPREAD * 2));
        ratios.push(Math.max(minRatio, Math.min(maxRatio, ratio)));
    }

    adjustRatiosToTotal(ratios, minRatio, maxRatio);
    return ratios;
}

/**
 * Adjust ratios to sum exactly to RATIO_BASE while respecting min/max bounds.
 * Uses incremental adjustment first, then applies final remainder to last ratio if needed.
 *
 * @param ratios - Array of ratios to adjust (modified in place)
 * @param minRatio - Minimum allowed ratio value
 * @param maxRatio - Maximum allowed ratio value
 */
function adjustRatiosToTotal(ratios: number[], minRatio: number, maxRatio: number) {
    let currentTotal = ratios.reduce((acc, ratio) => acc + ratio, 0);
    const targetTotal = RATIO_BASE;
    const increment = currentTotal < targetTotal ? 1 : -1;
    const maxIterations = ratios.length * Math.abs(targetTotal - currentTotal);

    // Adjust ratios incrementally while respecting min/max bounds
    let iterations = 0;
    while (currentTotal !== targetTotal && iterations < maxIterations) {
        let adjusted = false;
        for (let i = 0; i < ratios.length && currentTotal !== targetTotal; i++) {
            const nextValue = ratios[i] + increment;
            if (nextValue >= minRatio && nextValue <= maxRatio) {
                ratios[i] = nextValue;
                currentTotal += increment;
                adjusted = true;
            }
        }
        // Safety check: if no adjustments were made, break to avoid infinite loop
        if (!adjusted) {
            break;
        }
        iterations++;
    }

    // Final adjustment: add any remaining difference to the last ratio
    // This handles edge cases where incremental adjustment couldn't reach exact total
    // Note: This may violate min/max bounds if the difference is large, but ensures sum is correct
    const finalTotal = currentTotal;
    if (finalTotal !== targetTotal) {
        ratios[ratios.length - 1] += targetTotal - finalTotal;
    }
}
