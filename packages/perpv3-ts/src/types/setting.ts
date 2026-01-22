import type { Address } from 'viem';
import { abs, ratioToWad, sqrtX96ToTick, tickToWad, wadToTick, wdiv, wdivUp, wmul, wmulDown } from '../math';
import {
    DEFAULT_DEADLINE_SECONDS,
    DEFAULT_FUNDING_HOUR,
    MAX_TICK,
    MIN_TICK,
    ONE_RATIO,
    Q96,
    RATIO_BASE,
    WAD,
} from '../constants';
import { Errors, ErrorCode } from './error';
import { Condition, Side, sideSign, type QuoteParam, type Setting } from './contract';

export class UserSetting {
    /**
     * Deadline duration offset, in seconds
     */
    private readonly deadlineSeconds: number;
    /**
     * slippage tolerance, in basis points
     */
    public readonly slippage: number;
    /**
     * Target leverage for trades and orders (in WAD, e.g., 3e18 for 3x leverage)
     */
    public readonly leverage: bigint;
    /**
     * Buffer for mark price adjustment in basis points to account for price changes, default: 0
     */
    public readonly markPriceBufferInBps: number;
    public readonly strictMode?: boolean;

    constructor(
        deadline: number,
        slippage: number,
        leverage: bigint,
        markPriceBufferInBps: number = 0,
        strictMode?: boolean
    ) {
        // Validate leverage is positive
        if (leverage <= 0n) {
            throw Errors.invalidLeverage(leverage);
        }

        this.deadlineSeconds = deadline;
        this.slippage = slippage;
        this.leverage = leverage;
        this.markPriceBufferInBps = markPriceBufferInBps;
        this.strictMode = strictMode;
    }

    /**
     * Returns the configured deadline offset in seconds.
     * Useful for diagnostics; not intended for direct calldata use.
     */
    get deadlineOffset(): number {
        return this.deadlineSeconds;
    }

    /**
     * Gets a valid deadline timestamp.
     * If deadline is provided and positive, returns currentTimestamp + deadline.
     * Otherwise, returns currentTimestamp + DEFAULT_DEADLINE_SECONDS (10 minutes).
     *
     * @param currentTimestamp - Current timestamp in seconds (defaults to Date.now() / 1000)
     */
    getDeadline(currentTimestamp?: number): number {
        const now = currentTimestamp ?? Math.floor(Date.now() / 1000);
        if (this.deadlineSeconds && this.deadlineSeconds > 0) {
            return now + this.deadlineSeconds;
        }
        return now + DEFAULT_DEADLINE_SECONDS;
    }

    /**
     * Gets the limit tick for a trade based on trade price and side.
     * Uses the slippage tolerance from this UserSetting.
     */
    getTradeLimitTick(tradePrice: bigint, side: Side): number {
        const sign = sideSign(side);
        const limitPrice = (tradePrice * (ONE_RATIO + BigInt(sign * this.slippage))) / ONE_RATIO;
        const limitTick = wadToTick(limitPrice);
        return sign > 0 ? limitTick : limitTick + 1;
    }

    /**
     * Gets encoded liquidity limit ticks from sqrt price.
     * Uses the slippage tolerance from this UserSetting.
     */
    getEncodedLiquidityLimitTicks(sqrtPX96: bigint): bigint {
        const sqrtStrikePX96Lower = sqrtPX96 - wmulDown(sqrtPX96, ratioToWad(this.slippage));
        const sqrtStrikePX96Upper = sqrtPX96 + wmulDown(sqrtPX96, ratioToWad(this.slippage));

        // Encode limit ticks from sqrt strike prices
        const INT24_MIN = -(1 << 23);
        const INT24_MAX = (1 << 23) - 1;
        const ZERO_TICK = 0n;
        const normalize = (tick: number): bigint => {
            const value = BigInt(tick);
            return value >= 0 ? value : (1n << 24n) + value;
        };

        // Add +1 to lowerTick to ensure the range includes the current price when converting from sqrt price to tick.
        // This accounts for rounding behavior in sqrtX96ToTick conversion.
        const lowerTick = sqrtStrikePX96Lower === ZERO_TICK ? INT24_MIN : sqrtX96ToTick(sqrtStrikePX96Lower) + 1;
        const upperTick = sqrtStrikePX96Upper === ZERO_TICK ? INT24_MAX : sqrtX96ToTick(sqrtStrikePX96Upper);

        return (normalize(lowerTick) << 24n) + normalize(upperTick);
    }

    /**
     * Validate this UserSetting's leverage against maximum allowed leverage.
     * Basic validation (leverage > 0) is done in constructor.
     * This method only validates against instrument-specific maximum leverage.
     *
     * @param maxLeverage - Maximum allowed leverage from instrument setting
     * @throws {ValidationError} If leverage exceeds maximum
     */
    validateLeverage(maxLeverage: bigint): void {
        if (maxLeverage > 0n && this.leverage > maxLeverage) {
            throw Errors.validation('Leverage exceeds maximum allowed', ErrorCode.INVALID_LEVERAGE, {
                leverage: this.leverage.toString(),
                maxLeverage: maxLeverage.toString(),
            });
        }
    }
}

const MIN_ORDER_MULTIPLIER = 2;
const MIN_RANGE_MULTIPLIER = 10;
export const MAX_SLIPPAGE = 10000;
export const MAX_CANCEL_ORDER_COUNT = 8;

export class InstrumentSetting {
    // Basic instrument info
    public readonly symbol: string;
    public readonly configAddress: Address;
    public readonly gateAddress: Address;
    public readonly marketAddress: Address;

    // Quote-related fields (grouped together)
    public readonly quoteAddress: Address;
    public readonly quoteDecimals: number;
    public readonly quoteParam: QuoteParam;

    // Margin ratios
    public readonly initialMarginRatio: number;
    public readonly maintenanceMarginRatio: number;

    // Flags and status
    public readonly condition: Condition;
    public readonly placePaused: boolean;
    public readonly fundingHour: number;
    public readonly disableOrderRebate: boolean;

    // Spacing
    public readonly pearlSpacing: number;
    public readonly orderSpacing: number;
    public readonly rangeSpacing: number;

    constructor(
        setting: Setting,
        condition: Condition,
        pearlSpacing: number,
        orderSpacing: number,
        rangeSpacing: number
    ) {
        // Basic instrument info
        this.symbol = setting.symbol;
        this.configAddress = setting.config;
        this.gateAddress = setting.gate;
        this.marketAddress = setting.market;

        // Quote-related fields (grouped together)
        this.quoteAddress = setting.quote;
        this.quoteDecimals = setting.decimals;
        this.quoteParam = setting.param;

        // Margin ratios
        this.initialMarginRatio = setting.initialMarginRatio;
        this.maintenanceMarginRatio = setting.maintenanceMarginRatio;

        // Flags and status
        this.condition = condition;
        this.placePaused = setting.placePaused;
        this.fundingHour = setting.fundingHour;
        this.disableOrderRebate = setting.disableOrderRebate;

        // Spacing
        this.pearlSpacing = pearlSpacing;
        this.orderSpacing = orderSpacing;
        this.rangeSpacing = rangeSpacing;
    }

    get imr(): number {
        return this.initialMarginRatio;
    }

    get mmr(): number {
        return this.maintenanceMarginRatio;
    }

    /**
     * Funding interval in seconds.
     * Uses fundingHour from setting, or DEFAULT_FUNDING_HOUR if not set.
     */
    get fundingSeconds(): number {
        const effectiveFundingHour = this.fundingHour > 0 ? this.fundingHour : DEFAULT_FUNDING_HOUR;
        return effectiveFundingHour * 3600;
    }

    /**
     * Minimum trade value based on initial margin ratio
     */
    get minTradeValue(): bigint {
        return (this.quoteParam.minMarginAmount * BigInt(RATIO_BASE)) / BigInt(this.initialMarginRatio);
    }

    /**
     * Minimum order value (2x minimum trade value)
     */
    get minOrderValue(): bigint {
        return this.minTradeValue * BigInt(MIN_ORDER_MULTIPLIER);
    }

    /**
     * Minimum range value (10x minimum trade value)
     */
    get minRangeValue(): bigint {
        return this.minTradeValue * BigInt(MIN_RANGE_MULTIPLIER);
    }

    /// liquidity = (margin * boost)/(2 * sqrt(fairPrice))
    /// boost = 2 * liquidity * sqrt(fairPrice) / margin
    /// margin * boost >= (param.minMarginAmount / IMR * 10)->
    ///         2 * liquidity * sqrt(fairPrice) >= (param.minMarginAmount / IMR * 10)
    /// that is liquidity >= (param.minMarginAmount / IMR * 10) / (2 * sqrt(fairPrice))
    minLiquidity(sqrtPX96: bigint): bigint {
        // Returns minRangeValue * Q96 / (2n * sqrtPX96)
        return (this.minRangeValue * Q96) / (2n * sqrtPX96);
    }

    /**
     * Minimum tick delta based on initial margin ratio
     */
    get minTickDelta(): number {
        // Formula: wadToTick(ratioToWad(initialMarginRatio) + WAD)
        return wadToTick(ratioToWad(this.initialMarginRatio) + WAD);
    }

    /**
     *  Order fee rebate ratio
     */
    get orderFeeRebateRatio(): number {
        return this.disableOrderRebate ? 0 : this.quoteParam.tradingFeeRatio;
    }

    /**
     * Align order tick to the nearest order spacing
     */
    alignOrderTick(tick: number): number {
        return this.orderSpacing * Math.round(tick / this.orderSpacing);
    }

    /**
     * Align tick to order spacing, ensuring it is strictly below the given reference tick.
     * Used for LONG limit orders that must be placed below the current AMM tick.
     *
     * @param referenceTick - The reference tick (e.g., post-trade AMM tick)
     * @returns Aligned tick that is strictly below the reference tick
     */
    alignTickStrictlyBelow(referenceTick: number): number {
        return this.orderSpacing * Math.floor((referenceTick - 1) / this.orderSpacing);
    }

    /**
     * Align tick to order spacing, ensuring it is strictly above the given reference tick.
     * Used for SHORT limit orders that must be placed above the current AMM tick.
     *
     * @param referenceTick - The reference tick (e.g., post-trade AMM tick)
     * @returns Aligned tick that is strictly above the reference tick
     */
    alignTickStrictlyAbove(referenceTick: number): number {
        return this.orderSpacing * Math.ceil((referenceTick + 1) / this.orderSpacing);
    }

    /**
     * Align limit order target price to the nearest order spacing tick
     */
    alignLimitOrderTargetPrice(price: bigint): { alignedTick: number; alignedPrice: bigint } {
        const alignedTick = this.alignOrderTick(wadToTick(price));
        const alignedPrice = tickToWad(alignedTick);
        return { alignedTick, alignedPrice };
    }

    /**
     * Align limit order target tick to the nearest order spacing tick
     */
    alignLimitOrderTargetTick(tick: number): { alignedTick: number; alignedPrice: bigint } {
        const alignedTick = this.alignOrderTick(tick);
        const alignedPrice = tickToWad(alignedTick);
        return { alignedTick, alignedPrice };
    }

    /**
     * Get limit order boundaries based on mark price and IMR
     */
    getLimitOrderBoundaries(markPrice: bigint): { maxTickUpper: number; minTickLower: number } {
        const maxDiff = wmul(markPrice, ratioToWad(this.imr)) * 2n;
        const rawUpperTick = wadToTick(markPrice + maxDiff);
        const rawLowerTick = wadToTick(markPrice - maxDiff);
        let maxTickUpper = this.orderSpacing * Math.floor(rawUpperTick / this.orderSpacing);
        let minTickLower = this.orderSpacing * Math.ceil(rawLowerTick / this.orderSpacing);

        // Check if raw ticks are within order limit (2 * IMR)
        if (wdiv(abs(tickToWad(rawUpperTick) - markPrice), markPrice) > ratioToWad(this.imr) * 2n) {
            maxTickUpper -= this.orderSpacing;
        }

        if (wdiv(abs(tickToWad(rawLowerTick) - markPrice), markPrice) > ratioToWad(this.imr) * 2n) {
            minTickLower += this.orderSpacing;
        }

        return {
            maxTickUpper,
            minTickLower,
        };
    }

    /**
     * Align range tick lower bound
     */
    alignRangeTickLower(tickLower: number): number {
        if (tickLower > 0) {
            return this.rangeSpacing * Math.trunc(tickLower / this.rangeSpacing);
        }
        return this.rangeSpacing * Math.trunc((tickLower - (this.rangeSpacing - 1)) / this.rangeSpacing);
    }

    /**
     * Align range tick upper bound
     */
    alignRangeTickUpper(tickUpper: number): number {
        if (tickUpper < 0) {
            return this.rangeSpacing * Math.trunc(tickUpper / this.rangeSpacing);
        }
        return this.rangeSpacing * Math.trunc((tickUpper + (this.rangeSpacing - 1)) / this.rangeSpacing);
    }

    get maxLeverage(): bigint {
        return (WAD * BigInt(RATIO_BASE)) / BigInt(this.initialMarginRatio);
    }

    /**
     * Check if a leverage value is within the instrument's maximum allowed leverage.
     */
    isLeverageValid(leverage: bigint): boolean {
        return leverage > 0n && leverage <= this.maxLeverage;
    }

    /**
     * Calculate the minimum base quantity required for a LimitOrder at a specific tick.
     */
    minOrderSizeAtTick(tick: number): bigint {
        return wdivUp(this.minOrderValue, tickToWad(tick));
    }

    /**
     * Get the feasible tick range for placing LimitOrders of a given side.
     */
    getFeasibleLimitOrderTickRange(
        side: Side,
        ammTick: number,
        markPrice: bigint
    ): { minTick: number; maxTick: number } | null {
        const imr = ratioToWad(this.imr);
        const maxDeviation = imr * 2n;

        if (side === Side.LONG) {
            // LONG orders: ticks < ammTick, price deviation within [markPrice - 2*IMR*markPrice, markPrice]
            const maxTick = ammTick - 1;
            const minDeviationPrice = markPrice - wmul(markPrice, maxDeviation);
            const minDeviationTick = wadToTick(minDeviationPrice);

            // minDeviationTick is the lower bound, maxTick is the upper bound
            const effectiveMinTick = Math.max(MIN_TICK, minDeviationTick);
            const effectiveMaxTick = maxTick;

            const alignedMinTick = this.alignTickStrictlyAbove(effectiveMinTick - 1);
            const alignedMaxTick = this.alignTickStrictlyBelow(effectiveMaxTick + 1);

            if (alignedMinTick < MIN_TICK || alignedMaxTick > MAX_TICK) {
                return null;
            }

            if (alignedMinTick > alignedMaxTick) {
                return null;
            }

            return { minTick: alignedMinTick, maxTick: alignedMaxTick };
        } else {
            // SHORT orders: ticks > ammTick, price deviation within [markPrice, markPrice + 2*IMR*markPrice]
            const minTick = ammTick + 1;
            const maxDeviationPrice = markPrice + wmul(markPrice, maxDeviation);
            const maxDeviationTick = wadToTick(maxDeviationPrice);

            // minTick is the lower bound, maxDeviationTick is the upper bound
            const effectiveMinTick = minTick;
            const effectiveMaxTick = Math.min(MAX_TICK, maxDeviationTick);

            const alignedMinTick = this.alignTickStrictlyAbove(effectiveMinTick - 1);
            const alignedMaxTick = this.alignTickStrictlyBelow(effectiveMaxTick + 1);

            if (alignedMinTick < MIN_TICK || alignedMaxTick > MAX_TICK) {
                return null;
            }

            if (alignedMinTick > alignedMaxTick) {
                return null;
            }

            return { minTick: alignedMinTick, maxTick: alignedMaxTick };
        }
    }

    /**
     * Check if a specific tick is valid for placing a LimitOrder of the given side.
     *
     * This performs lower-level tick validation without checking market state or order slots:
     * - Tick bounds (MIN_TICK to MAX_TICK)
     * - Tick spacing alignment (orderSpacing)
     * - Side constraint (LONG < ammTick, SHORT > ammTick)
     * - Price deviation from mark price (within 2×IMR)
     *
     * **Comparison with PairSnapshot.isTickFeasibleForLimitOrder():**
     * - `InstrumentSetting.isTickValidForLimitOrder()` (this method): Pure tick validation
     *   without market state or order slot checks. Use for theoretical calculations.
     * - `PairSnapshot.isTickFeasibleForLimitOrder()`: Full feasibility check including
     *   market state, pause status, and existing orders. Use for actual order placement.
     *
     * @param tick - The tick to validate
     * @param side - Order side (LONG or SHORT)
     * @param ammTick - Current AMM tick
     * @param markPrice - Current mark price in WAD
     * @returns Object with `valid` boolean and optional `reason` string if invalid
     *
     * @example
     * ```typescript
     * const setting = snapshot.instrumentSetting;
     * const result = setting.isTickValidForLimitOrder(
     *   1000,
     *   Side.LONG,
     *   snapshot.amm.tick,
     *   snapshot.priceData.markPrice
     * );
     * ```
     */
    isTickValidForLimitOrder(
        tick: number,
        side: Side,
        ammTick: number,
        markPrice: bigint
    ): { valid: boolean; reason?: string } {
        if (tick < MIN_TICK || tick > MAX_TICK) {
            return {
                valid: false,
                reason: `Tick must be within [${MIN_TICK}, ${MAX_TICK}]`,
            };
        }

        // Check tick alignment
        if (Math.abs(tick) % this.orderSpacing !== 0) {
            return {
                valid: false,
                reason: `Tick must be multiple of order spacing ${this.orderSpacing}`,
            };
        }

        // Check side constraint
        if (side === Side.LONG && tick >= ammTick) {
            return {
                valid: false,
                reason: `LONG orders must be placed at ticks < current AMM tick (${ammTick})`,
            };
        }
        if (side === Side.SHORT && tick <= ammTick) {
            return {
                valid: false,
                reason: `SHORT orders must be placed at ticks > current AMM tick (${ammTick})`,
            };
        }

        // Check price deviation (within 2 * IMR)
        const imr = ratioToWad(this.imr);
        const targetPrice = tickToWad(tick);
        const priceDeviation = wdiv(abs(targetPrice - markPrice), markPrice);
        if (priceDeviation > imr * 2n) {
            return {
                valid: false,
                reason: `Order too far from mark price (deviation: ${priceDeviation.toString()}, max: ${(imr * 2n).toString()})`,
            };
        }

        return { valid: true };
    }

    /**
     * Get the feasible tick range for creating liquidity ranges.
     */
    getFeasibleRangeTickRange(): { minTick: number; maxTick: number } {
        // For range bounds we must return *aligned ticks within* [MIN_TICK, MAX_TICK].
        // Note: `alignRangeTickLower(MIN_TICK)` may underflow below MIN_TICK when MIN_TICK
        // is not a multiple of `rangeSpacing`, and `alignRangeTickUpper(MAX_TICK)` may overflow
        // above MAX_TICK. Use the opposite aligners to stay in-bounds.
        const alignedMinTick = this.alignRangeTickUpper(MIN_TICK);
        const alignedMaxTick = this.alignRangeTickLower(MAX_TICK);
        return { minTick: alignedMinTick, maxTick: alignedMaxTick };
    }

    /**
     * Validate a tick pair for a liquidity range.
     */
    isRangeTickPairValid(tickLower: number, tickUpper: number, ammTick: number): boolean {
        // Check tickLower < tickUpper
        if (tickLower >= tickUpper) {
            return false;
        }

        // Check both ticks are multiples of rangeSpacing
        if (tickLower % this.rangeSpacing !== 0 || tickUpper % this.rangeSpacing !== 0) {
            return false;
        }

        // Check bounds
        if (tickLower < MIN_TICK || tickUpper > MAX_TICK) {
            return false;
        }

        // Check tickLower and tickUpper are on different sides of ammTick
        if (tickLower >= ammTick || tickUpper <= ammTick) {
            return false;
        }

        // Check IMR restriction: tickDeltaLower = ammTick - tickLower >= minTickDelta
        const tickDeltaLower = ammTick - tickLower;
        if (tickDeltaLower < this.minTickDelta) {
            return false;
        }

        // Check IMR restriction: tickDeltaUpper = tickUpper - ammTick >= minTickDelta
        const tickDeltaUpper = tickUpper - ammTick;
        if (tickDeltaUpper < this.minTickDelta) {
            return false;
        }

        return true;
    }
}
