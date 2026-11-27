import { abs, wdiv, wmul, sqrtX96ToWad, ratioToWad, mulDivNearest, wadToTick, wadToSqrtX96 } from '../math';
import { ZERO, MIN_TICK, MAX_TICK } from '../constants';
import { Errors, ErrorCode } from './error';
import { Order } from './order';
import { InstrumentSetting } from './setting';
import { QuotationWithSize } from './quotation';
import { Position } from './position';
import { Range } from './range';
import {
    Condition,
    Status,
    PERP_EXPIRY,
    Side,
    type Amm,
    type PriceData,
    type Portfolio,
    type Quotation,
    type QuoteState,
    type BlockInfo,
    type PlaceParam,
    type OnchainContext,
} from './contract';
import type { Address } from 'viem';
import { formatExpiryLabel } from '../utils/expiry';

/**
 * PairSnapshot represents a snapshot of the complete on-chain state of a trading pair and trader's portfolio.
 *
 * This class encapsulates:
 * - Raw contract data (amm, priceData, blockInfo)
 * - Trader-specific data (portfolio, and quoteState when requested)
 * - Optional quotation (only present when signedSize is provided)
 * - Computed instrument settings (instrumentSetting) - contains setting, condition, and spacing
 * - Pair identification (instrumentAddress, expiry) - defines the trading pair
 * - Validation methods for place, trade, and add operations
 *
 * Note: `setting`, `condition`, and `spacing` are not exposed directly as they are redundant
 * with `instrumentSetting`. Access them via `instrumentSetting` instead.
 *
 * This class wraps the raw `OnchainContext` contract struct with computed properties and methods.
 */
type SnapshotInput = Omit<OnchainContext, 'quoteState'> & {
    quoteState: QuoteState | null;
    priceSource?: 'reported' | 'estimated';
};

export class PairSnapshot {
    public readonly instrumentAddress: Address;
    public readonly expiry: number;
    public readonly blockInfo: BlockInfo;
    public readonly instrumentSetting: InstrumentSetting;
    public readonly amm: Amm;
    public readonly priceData: PriceData;
    public readonly portfolio: Portfolio;
    public readonly quoteState: QuoteState | null;
    public readonly priceSource: 'reported' | 'estimated';
    public readonly quotation?: Quotation;

    constructor(options: SnapshotInput) {
        this.blockInfo = options.blockInfo;
        this.amm = options.amm;
        this.priceData = options.priceData;
        this.priceSource = options.priceSource ?? 'reported';
        this.portfolio = options.portfolio;
        this.quoteState = options.quoteState;
        // Extract pair identification from priceData and amm
        this.instrumentAddress = options.priceData.instrument;
        this.expiry = options.amm.expiry;
        // Create InstrumentSetting from setting, condition, and spacing
        this.instrumentSetting = new InstrumentSetting(
            options.setting,
            options.condition,
            options.spacing.pearl,
            options.spacing.order,
            options.spacing.range
        );
        this.quotation = options.quotation;
    }

    requireQuoteState(): QuoteState {
        if (!this.quoteState) throw Errors.apiRequestFailed('Account quote state was not requested');
        return this.quoteState;
    }

    /**
     * Get the instrument symbol (e.g., "ETH-USDM").
     */
    get instrumentSymbol(): string {
        return this.instrumentSetting.symbol;
    }

    /**
     * Get the pair symbol (e.g., "ETH-USDM-PERP" for perpetuals or "ETH-USDM-241225" for dated contracts).
     * Format: {instrumentSymbol}-{PERP|YYMMDD}
     */
    get pairSymbol(): string {
        return `${this.instrumentSymbol}-${formatExpiryLabel(this.expiry, true)}`;
    }

    /**
     * Create a new PairSnapshot with overridden properties.
     *
     * This method is useful for creating modified snapshots, e.g., with updated AMM state
     * after a simulated trade. The `instrumentSetting` property will be automatically
     * recomputed from the new `setting`, `condition`, and `spacing` values.
     *
     * @param overrides - Partial properties to override
     * @returns New PairSnapshot instance with overridden properties
     *
     * @example
     * ```typescript
     * const updatedAmm = { ...snapshot.amm, tick: newTick };
     * const updatedSnapshot = snapshot.with({ amm: updatedAmm });
     * ```
     */
    with(overrides: Partial<SnapshotInput>): PairSnapshot {
        // Reconstruct setting, condition, and spacing from instrumentSetting if not overridden
        const setting = overrides.setting ?? {
            symbol: this.instrumentSetting.symbol,
            config: this.instrumentSetting.configAddress,
            gate: this.instrumentSetting.gateAddress,
            market: this.instrumentSetting.marketAddress,
            quote: this.instrumentSetting.quoteAddress,
            decimals: this.instrumentSetting.quoteDecimals,
            param: this.instrumentSetting.quoteParam,
            initialMarginRatio: this.instrumentSetting.initialMarginRatio,
            maintenanceMarginRatio: this.instrumentSetting.maintenanceMarginRatio,
            placePaused: this.instrumentSetting.placePaused,
            fundingHour: this.instrumentSetting.fundingHour,
            disableOrderRebate: this.instrumentSetting.disableOrderRebate,
        };
        const condition = overrides.condition ?? this.instrumentSetting.condition;
        const spacing = overrides.spacing ?? {
            pearl: this.instrumentSetting.pearlSpacing,
            order: this.instrumentSetting.orderSpacing,
            range: this.instrumentSetting.rangeSpacing,
        };
        const quotation = 'quotation' in overrides ? overrides.quotation : this.quotation;

        return new PairSnapshot({
            setting,
            condition,
            amm: overrides.amm ?? this.amm,
            priceData: overrides.priceData ?? this.priceData,
            spacing,
            blockInfo: overrides.blockInfo ?? this.blockInfo,
            portfolio: overrides.portfolio ?? this.portfolio,
            quoteState: overrides.quoteState === undefined ? this.quoteState : overrides.quoteState,
            priceSource: overrides.priceSource ?? this.priceSource,
            quotation,
        });
    }

    /**
     * Create an empty portfolio (no orders, ranges, or position)
     */
    static emptyPortfolio(): Portfolio {
        return {
            oids: [],
            rids: [],
            orders: [],
            ranges: [],
            ordersTaken: [],
            position: Position.empty(),
        };
    }

    /**
     * Create an empty quote state (all zeros, useful for initialization)
     * Note: This should typically be fetched from contract, but can be used as a placeholder
     */
    static emptyQuoteState(quoteAddress: Address, decimals: number, symbol: string): QuoteState {
        return {
            quote: quoteAddress,
            decimals,
            symbol,
            threshold: 0n,
            reserve: 0n,
            balance: 0n,
            allowance: 0n,
            fundFlow: {
                totalIn: 0n,
                totalOut: 0n,
            },
            pending: {
                timestamp: 0,
                native: false,
                amount: 0n,
                exemption: 0n,
            },
        };
    }

    /**
     * Validate PlaceParam with full context validation.
     * Checks condition, status, tick alignment, price deviation, margin requirements, and order slot availability.
     *
     * @param placeParam - PlaceParam to validate
     * @throws {SimulationError} If instrument is not tradable (condition, status, paused)
     * @throws {ValidationError} If validation fails (tick, price deviation, margin, order slot)
     */
    validatePlaceParam(placeParam: PlaceParam): void {
        const { instrumentSetting, amm } = this;
        const markPrice = this.priceData.markPrice;

        // Check order placement tradability
        const tradability = this.isOrderPlacementTradable();
        if (!tradability.tradable) {
            throw Errors.simulation(tradability.reason || 'Instrument not tradable', ErrorCode.SIMULATION_FAILED);
        }

        if (placeParam.size === 0n) {
            throw Errors.validation('Order size cannot be zero', ErrorCode.INVALID_SIZE, {
                size: placeParam.size.toString(),
            });
        }

        // Determine side from signed size
        const side = placeParam.size > 0n ? Side.LONG : Side.SHORT;

        // Use comprehensive tick feasibility check
        const tickFeasibility = this.isTickFeasibleForLimitOrder(placeParam.tick, side);
        if (!tickFeasibility.feasible) {
            throw Errors.validation(tickFeasibility.reason || 'Invalid tick for limit order', ErrorCode.INVALID_TICK, {
                tick: placeParam.tick,
                side,
                ammTick: amm.tick,
            });
        }

        // Create Order instance to use its getters for validation
        const order = new Order(placeParam.amount, placeParam.size, placeParam.tick, 0);

        // Fair price deviation check: verify AMM fair price (from sqrtPX96) is within IMR of mark price
        // Note: This is distinct from the target price check in isTickFeasibleForLimitOrder (which checks order tick price vs mark)
        // This check ensures the AMM's current fair price hasn't deviated too far from oracle mark price
        const fairPrice = sqrtX96ToWad(amm.sqrtPX96);
        const imr = ratioToWad(instrumentSetting.imr);
        if (wdiv(abs(fairPrice - markPrice), markPrice) > imr) {
            throw Errors.validation('Fair price deviation too large', ErrorCode.INVALID_PARAM, {
                fairPrice: fairPrice.toString(),
                markPrice: markPrice.toString(),
                maxDeviation: imr.toString(),
            });
        }

        // Calculate minimum margin required using Order.marginForLeverage()
        // maxLeverage = (WAD * RATIO_BASE) / IMR, so using maxLeverage gives us margin at IMR
        // marginForLeverage uses max(targetPrice, markPrice) * abs(size) / leverage
        // With maxLeverage, this equals max(targetPrice, markPrice) * abs(size) * IMR / (WAD * RATIO_BASE)
        // which is equivalent to max(targetPrice, markPrice) * abs(size) * ratioToWad(IMR)
        const minMarginRequired = order.marginForLeverage(markPrice, instrumentSetting.maxLeverage, 0);
        if (placeParam.amount < minMarginRequired) {
            throw Errors.validation('Order margin below minimum required for IMR', ErrorCode.INVALID_AMOUNT, {
                amount: placeParam.amount.toString(),
                minMarginRequired: minMarginRequired.toString(),
            });
        }

        // Check minimum order value using Order.value getter
        if (order.value < instrumentSetting.minOrderValue) {
            throw Errors.validation('Order value below minimum order value', ErrorCode.INVALID_PARAM, {
                orderValue: order.value.toString(),
                minOrderValue: instrumentSetting.minOrderValue.toString(),
            });
        }
    }

    /**
     * Validate that fair price deviation from mark price is within acceptable limits for negative margin adjustments.
     * This check prevents reducing margin from positions when the market shows significant price deviation,
     * which could indicate manipulation or oracle issues.
     *
     * Matches the Solidity contract check: `fair.absDiff(mark).wdiv(mark) > IMR` reverts with `ForbidNegativeAdjust()`
     *
     * @throws {ValidationError} If fair price deviation exceeds initial margin ratio
     */
    validateNegativeAdjustFairDeviation(): void {
        const { instrumentSetting } = this;
        const markPrice = this.priceData.markPrice;
        const fair = sqrtX96ToWad(this.amm.sqrtPX96);
        const imrWad = ratioToWad(instrumentSetting.imr);
        const deviation = wdiv(abs(fair - markPrice), markPrice);

        if (deviation > imrWad) {
            throw Errors.validation('Fair price deviation too large', ErrorCode.INVALID_PARAM, {
                fair: fair.toString(),
                markPrice: markPrice.toString(),
                deviation: deviation.toString(),
                maxDeviation: imrWad.toString(),
            });
        }
    }

    /**
     * Validate trade context with full validation.
     * Checks condition, status, price deviation, and minimum trade value.
     *
     * @param quotationWithSize - Quotation with size for the trade
     * @param prePosition - Position before the trade (defaults to portfolio.position if not provided)
     * @throws {SimulationError} If instrument is not tradable (condition, status)
     * @throws {ValidationError} If validation fails (price deviation, minimum trade value)
     */
    validateTradeContext(quotationWithSize: QuotationWithSize, prePosition?: Position): void {
        const { instrumentSetting, portfolio } = this;
        const position = prePosition ?? Position.ensureInstance(portfolio.position);

        // Check if instrument is tradable
        const tradability = this.isTradable();
        if (!tradability.tradable) {
            throw Errors.simulation(tradability.reason || 'Instrument not tradable', ErrorCode.SIMULATION_FAILED);
        }

        // Check 3: Price deviation check (only prevents trades that INCREASE deviation)
        // Contract: checkDeviation() only reverts if price moves FURTHER from benchmark
        // Allows trades that move price CLOSER to benchmark, even if already deviated
        const benchmark = quotationWithSize.quotation.benchmark;
        const prevFair = sqrtX96ToWad(quotationWithSize.quotation.sqrtFairPX96);
        const postFair = sqrtX96ToWad(quotationWithSize.quotation.sqrtPostFairPX96);

        // Calculate deviation ratios
        const prevDeviation = wdiv(abs(prevFair - benchmark), benchmark);
        const postDeviation = wdiv(abs(postFair - benchmark), benchmark);

        // Use MMR as threshold (matching contract's checkDeviation logic)
        const mmrWad = ratioToWad(instrumentSetting.mmr);

        // Check if price crossed benchmark (flipped sides)
        const prevAbove = prevFair >= benchmark;
        const postAbove = postFair >= benchmark;
        const flipped = prevAbove !== postAbove;

        // Case 1: Price crossed benchmark
        if (flipped && postDeviation > mmrWad) {
            throw Errors.validation('Trade crosses benchmark with excessive deviation', ErrorCode.INVALID_PARAM, {
                benchmark: benchmark.toString(),
                postFair: postFair.toString(),
                postDeviation: postDeviation.toString(),
                maxDeviation: mmrWad.toString(),
            });
        }

        // Case 2: Price moved further from benchmark (deviation increased)
        if (!flipped && postDeviation > prevDeviation && postDeviation > mmrWad) {
            throw Errors.validation('Trade would increase price deviation beyond limit', ErrorCode.INVALID_PARAM, {
                prevDeviation: prevDeviation.toString(),
                postDeviation: postDeviation.toString(),
                maxDeviation: mmrWad.toString(),
            });
        }

        // Check 4: Minimum trade value (only for opening NEW positions)
        // Contract (Oyster.sol:338-340): only checks when old.size == 0
        // Does NOT check for increasing existing positions or closing
        if (position.size === ZERO) {
            // Use entryNotional (tradeValue) which is the actual trade value, not markPrice * baseQuantity
            const tradeValue = quotationWithSize.tradeValue;
            if (tradeValue < instrumentSetting.minTradeValue) {
                throw Errors.validation('Trade value below minimum trade value', ErrorCode.INVALID_PARAM, {
                    tradeValue: tradeValue.toString(),
                    minTradeValue: instrumentSetting.minTradeValue.toString(),
                });
            }
        }
    }

    /**
     * Check margin availability for a trader.
     * Calculates the gaps between required margin and available reserve/balance/allowance.
     *
     * Uses quoteState data directly (no RPC calls needed).
     *
     * @param marginRequired - Required margin amount in token decimals
     * @returns Object with `allowanceGap` and `marginGap` (both in token decimals)
     *          - `allowanceGap`: Additional allowance needed (0 if sufficient). If using ERC20 `approve`, approve
     *            `allowance + allowanceGap` (since `approve` sets the allowance value).
     *          - `marginGap`: Additional margin needed (0 if sufficient)
     */
    checkMargin(marginRequired: bigint): { allowanceGap: bigint; marginGap: bigint } {
        const { reserve, balance, allowance } = this.requireQuoteState();

        let allowanceGap = 0n;
        let marginGap = 0n;

        // If we have enough reserve, no gaps needed
        if (reserve >= marginRequired) {
            return { allowanceGap, marginGap };
        }

        // Calculate how much we need from balance
        const neededFromBalance = marginRequired - reserve;

        // Check if we have enough total balance (reserve + wallet balance)
        if (balance + reserve >= marginRequired) {
            // We have enough balance, check if we need more allowance
            if (allowance >= neededFromBalance) {
                // We have enough allowance, no gaps
                return { allowanceGap, marginGap };
            } else {
                // Need more allowance for the amount we need to deposit
                allowanceGap = neededFromBalance - allowance;
            }
        } else {
            // Not enough total balance
            marginGap = marginRequired - (balance + reserve);
        }

        return { allowanceGap, marginGap } as const;
    }

    /**
     * Update AMM funding indices based on time elapsed and price difference.
     * Only applies to perpetual contracts (expiry === PERP_EXPIRY).
     *
     * @param timestamp - Current timestamp in seconds (defaults to blockInfo.timestamp)
     * @returns Updated AMM with funding indices applied
     */
    updateAmmFundingIndex(timestamp?: number): Amm {
        const amm = this.amm;
        const timeElapsed = (timestamp ?? this.blockInfo.timestamp) - amm.timestamp;

        if (amm.expiry !== PERP_EXPIRY || timeElapsed <= 0) {
            return amm;
        }

        const markPrice = this.priceData.markPrice;
        const fairPrice = sqrtX96ToWad(amm.sqrtPX96);
        const priceDiff = abs(fairPrice - markPrice);
        const longPayShort = fairPrice > markPrice;

        // Determine payer and receiver sides
        const payerSize = longPayShort ? amm.totalLong : amm.totalShort;
        const receiverSize = longPayShort ? amm.totalShort : amm.totalLong;

        if (payerSize === ZERO) {
            return amm;
        }

        // Calculate funding fee index based on time elapsed
        const fundingFeeIndex = mulDivNearest(
            priceDiff,
            BigInt(timeElapsed),
            BigInt(Math.max(1, this.instrumentSetting.fundingSeconds))
        );

        // Update payer index (decrease by funding fee)
        const payerIndex = longPayShort ? amm.longFundingIndex : amm.shortFundingIndex;
        const updatedPayerIndex = payerIndex - fundingFeeIndex;

        // Calculate total funding fee to distribute
        const totalFundingFee = wmul(fundingFeeIndex, payerSize);

        // Update receiver index or insurance fund
        const receiverIndex = longPayShort ? amm.shortFundingIndex : amm.longFundingIndex;
        let updatedReceiverIndex = receiverIndex;
        let updatedInsuranceFund = amm.insuranceFund;

        if (receiverSize > ZERO) {
            // Distribute funding fee to receiver side
            updatedReceiverIndex += wdiv(totalFundingFee, BigInt(receiverSize));
        } else if (totalFundingFee > ZERO) {
            // No receiver side: funding flows to insurance fund
            updatedInsuranceFund += totalFundingFee;
        }

        // Map back to long/short indices
        const longFundingIndex = longPayShort ? updatedPayerIndex : updatedReceiverIndex;
        const shortFundingIndex = longPayShort ? updatedReceiverIndex : updatedPayerIndex;

        return {
            ...amm,
            longFundingIndex,
            shortFundingIndex,
            insuranceFund: updatedInsuranceFund,
        };
    }

    /**
     * Check if the instrument is tradable (basic prerequisite check).
     */
    isTradable(): { tradable: boolean; reason?: string } {
        if (this.instrumentSetting.condition !== Condition.NORMAL) {
            return { tradable: false, reason: 'Instrument not tradable (condition)' };
        }

        const status = this.amm.status;
        if (status !== Status.TRADING && status !== Status.SETTLING) {
            return { tradable: false, reason: 'Instrument not tradable in current status' };
        }

        return { tradable: true };
    }

    /**
     * Check if adding liquidity is allowed.
     * Allows DORMANT for the initial add, but blocks non-NORMAL condition and SETTLED status.
     */
    isAddLiquidityAllowed(): { allowed: boolean; reason?: string } {
        if (this.instrumentSetting.condition !== Condition.NORMAL) {
            return { allowed: false, reason: 'Instrument not tradable (condition)' };
        }

        if (this.amm.status === Status.SETTLED) {
            return { allowed: false, reason: 'Instrument not tradable in current status' };
        }

        return { allowed: true };
    }

    /**
     * Check if LimitOrder placement is tradable (includes placePaused check).
     */
    isOrderPlacementTradable(): { tradable: boolean; reason?: string } {
        const baseCheck = this.isTradable();
        if (!baseCheck.tradable) {
            return baseCheck;
        }

        if (this.instrumentSetting.placePaused) {
            return { tradable: false, reason: 'Placing orders is paused' };
        }

        return { tradable: true };
    }

    /**
     * Get effective AMM state for add-liquidity simulation.
     * For DORMANT, derive tick/sqrtPX96 from the expected initial mark price.
     */
    getAmmForAddLiquidity(): Amm {
        if (this.amm.status !== Status.DORMANT) {
            return this.amm;
        }

        const markPrice = this.getExpectedInitMarkPrice();
        if (markPrice <= 0n) {
            throw Errors.simulation('Cannot derive mark price for dormant AMM', ErrorCode.SIMULATION_FAILED);
        }

        const tick = wadToTick(markPrice);
        const sqrtPX96 = wadToSqrtX96(markPrice);

        return {
            ...this.amm,
            tick,
            sqrtPX96,
            status: Status.TRADING,
        };
    }

    /**
     * Get list of ticks that already have LimitOrders placed.
     */
    getOccupiedLimitOrderTicks(): number[] {
        const occupiedTicks: number[] = [];
        for (const oid of this.portfolio.oids) {
            const { tick } = Order.unpackKey(oid);
            occupiedTicks.push(tick);
        }
        return occupiedTicks;
    }

    /**
     * Get list of available orders (not fully taken).
     */
    getAvailableOrders(): Array<{ orderId: number; order: Order }> {
        const available: Array<{ orderId: number; order: Order }> = [];

        for (let i = 0; i < this.portfolio.oids.length; i++) {
            const orderId = this.portfolio.oids[i];
            const order = this.portfolio.orders[i];
            const taken = this.portfolio.ordersTaken[i] ?? ZERO;
            if (abs(taken) < abs(order.size)) {
                available.push({
                    orderId,
                    order,
                });
            }
        }

        return available;
    }

    /**
     * Comprehensive check if a tick is feasible for placing a LimitOrder.
     *
     * This is the recommended method for validating limit order placement as it performs
     * a complete feasibility check including:
     * - Instrument tradability (condition, status, pause state)
     * - Tick validation (bounds, spacing, side, price deviation)
     * - Order slot availability (checks if tick is already occupied)
     *
     * Use this method when you want a single comprehensive check before placing an order.
     *
     * **Comparison with InstrumentSetting.isTickValidForLimitOrder():**
     * - `PairSnapshot.isTickFeasibleForLimitOrder()` (this method): Full context-aware check
     *   including market state and existing orders. Use for actual order placement validation.
     * - `InstrumentSetting.isTickValidForLimitOrder()`: Lower-level tick validation without
     *   checking market state or order slots. Use for theoretical tick range calculations.
     *
     * @param tick - The tick to validate
     * @param side - Order side (LONG or SHORT)
     * @returns Object with `feasible` boolean and optional `reason` string if not feasible
     *
     * @example
     * ```typescript
     * const snapshot = await fetchOnchainContext(...);
     * const result = snapshot.isTickFeasibleForLimitOrder(1000, Side.LONG);
     * if (!result.feasible) {
     *   console.error(`Cannot place order: ${result.reason}`);
     * }
     * ```
     */
    isTickFeasibleForLimitOrder(tick: number, side: Side): { feasible: boolean; reason?: string } {
        const tradability = this.isOrderPlacementTradable();
        if (!tradability.tradable) {
            return { feasible: false, reason: tradability.reason };
        }

        const { instrumentSetting, amm, priceData } = this;
        const markPrice = priceData.markPrice;
        const ammTick = amm.tick;

        // Use InstrumentSetting's validation
        const tickValidation = instrumentSetting.isTickValidForLimitOrder(tick, side, ammTick, markPrice);
        if (!tickValidation.valid) {
            return { feasible: false, reason: tickValidation.reason };
        }

        // Check if order slot is occupied using helper method
        const occupiedTicks = this.getOccupiedLimitOrderTicks();
        if (occupiedTicks.includes(tick)) {
            return {
                feasible: false,
                reason: `Order slot already occupied at tick ${tick}`,
            };
        }

        return { feasible: true };
    }

    /**
     * Get feasible tick range for placing LimitOrders.
     *
     * Returns the overall range of ticks where limit orders can be placed based on:
     * - Current AMM tick position
     * - Mark price deviation limits (2*IMR)
     * - Instrument's order spacing
     *
     * Note: This method returns the overall feasible range. Individual ticks within
     * this range may still be occupied by existing orders. Use isTickFeasibleForLimitOrder()
     * to check if a specific tick is available for placing a new order.
     *
     * @param side - Order side (LONG or SHORT)
     * @returns Feasible tick range {minTick, maxTick} or null if no valid range exists
     */
    getFeasibleLimitOrderTickRange(side: Side): { minTick: number; maxTick: number } | null {
        const tradability = this.isOrderPlacementTradable();
        if (!tradability.tradable) {
            return null;
        }

        const { instrumentSetting, amm, priceData } = this;
        const markPrice = priceData.markPrice;
        const ammTick = amm.tick;

        return instrumentSetting.getFeasibleLimitOrderTickRange(side, ammTick, markPrice);
    }

    /**
     * Check if a cross LimitOrder is feasible.
     */
    isCrossLimitOrderFeasible(side: Side, targetTick: number): { feasible: boolean; reason?: string } {
        const tradability = this.isTradable();
        if (!tradability.tradable) {
            return { feasible: false, reason: tradability.reason };
        }

        const { amm } = this;
        const ammTick = amm.tick;

        // Check target tick is on correct side of AMM tick
        if (side === Side.LONG && targetTick <= ammTick) {
            return {
                feasible: false,
                reason: `LONG cross limit order target tick must be > current AMM tick (${ammTick})`,
            };
        }
        if (side === Side.SHORT && targetTick >= ammTick) {
            return {
                feasible: false,
                reason: `SHORT cross limit order target tick must be < current AMM tick (${ammTick})`,
            };
        }

        return { feasible: true };
    }

    /**
     * Get feasible target tick range for cross LimitOrder's market leg.
     */
    getFeasibleTargetTickRange(side: Side): { minTick: number; maxTick: number } | null {
        const tradability = this.isTradable();
        if (!tradability.tradable) {
            return null;
        }

        const { instrumentSetting, amm, priceData } = this;
        const markPrice = priceData.markPrice;
        const ammTick = amm.tick;

        const imr = ratioToWad(instrumentSetting.imr);
        const maxDeviation = imr * 2n;

        if (side === Side.LONG) {
            // LONG: targetTick > ammTick, price deviation within [markPrice, markPrice + 2*IMR*markPrice]
            const minTick = ammTick + 1;
            const maxDeviationPrice = markPrice + wmul(markPrice, maxDeviation);
            const maxDeviationTick = wadToTick(maxDeviationPrice);

            // minTick is the lower bound, maxDeviationTick is the upper bound
            const effectiveMinTick = minTick;
            const effectiveMaxTick = Math.min(MAX_TICK, maxDeviationTick);

            const alignedMinTick = instrumentSetting.alignTickStrictlyAbove(effectiveMinTick - 1);
            const alignedMaxTick = instrumentSetting.alignTickStrictlyBelow(effectiveMaxTick + 1);
            if (alignedMinTick > alignedMaxTick || alignedMinTick < MIN_TICK || alignedMaxTick > MAX_TICK) {
                return null;
            }
            return { minTick: alignedMinTick, maxTick: alignedMaxTick };
        } else {
            // SHORT: targetTick < ammTick, price deviation within [markPrice - 2*IMR*markPrice, markPrice]
            const maxTick = ammTick - 1;
            const minDeviationPrice = markPrice - wmul(markPrice, maxDeviation);
            const minDeviationTick = wadToTick(minDeviationPrice);

            // minDeviationTick is the lower bound, maxTick is the upper bound
            const effectiveMinTick = Math.max(MIN_TICK, minDeviationTick);
            const effectiveMaxTick = maxTick;

            const alignedMinTick = instrumentSetting.alignTickStrictlyAbove(effectiveMinTick - 1);
            const alignedMaxTick = instrumentSetting.alignTickStrictlyBelow(effectiveMaxTick + 1);
            if (alignedMinTick > alignedMaxTick || alignedMinTick < MIN_TICK || alignedMaxTick > MAX_TICK) {
                return null;
            }
            return { minTick: alignedMinTick, maxTick: alignedMaxTick };
        }
    }

    private getExpectedInitMarkPrice(): bigint {
        if (this.priceData.markPrice > 0n) {
            return this.priceData.markPrice;
        }

        if (this.amm.expiry === PERP_EXPIRY) {
            return this.priceData.spotPrice;
        }

        return this.priceData.benchmarkPrice;
    }

    /**
     * Check if margin withdrawal is allowed (fair price deviation check).
     */
    isWithdrawalAllowed(): { allowed: boolean; reason?: string } {
        const { instrumentSetting } = this;
        const markPrice = this.priceData.markPrice;
        const fair = sqrtX96ToWad(this.amm.sqrtPX96);
        const imrWad = ratioToWad(instrumentSetting.imr);
        const deviation = wdiv(abs(fair - markPrice), markPrice);

        if (deviation > imrWad) {
            return {
                allowed: false,
                reason: `Fair price deviation too large (deviation: ${deviation.toString()}, max: ${imrWad.toString()})`,
            };
        }

        return { allowed: true };
    }

    /**
     * Get maximum margin that can be withdrawn from the current position.
     */
    getMaxWithdrawableMargin(): bigint {
        const position = Position.ensureInstance(this.portfolio.position);
        const markPrice = this.priceData.markPrice;
        return position.maxWithdrawable(this.amm, this.instrumentSetting.initialMarginRatio, markPrice);
    }

    /**
     * Check if removing a specific liquidity range is feasible.
     */
    isRemoveLiquidityFeasible(tickLower: number, tickUpper: number): { feasible: boolean; reason?: string } {
        const tradability = this.isTradable();
        if (!tradability.tradable) {
            return { feasible: false, reason: tradability.reason };
        }

        // Check if range exists in portfolio
        const rangeKey = Range.packKey(tickLower, tickUpper);
        const rangeIndex = this.portfolio.rids.indexOf(rangeKey);
        if (rangeIndex === -1) {
            return {
                feasible: false,
                reason: `Range not found in portfolio (tickLower: ${tickLower}, tickUpper: ${tickUpper})`,
            };
        }

        return { feasible: true };
    }

    /**
     * Get list of ranges that can be removed.
     */
    getAvailableRanges(): Array<{ rangeId: number; range: Range }> {
        const available: Array<{ rangeId: number; range: Range }> = [];
        for (let i = 0; i < this.portfolio.rids.length; i++) {
            available.push({
                rangeId: this.portfolio.rids[i],
                range: this.portfolio.ranges[i],
            });
        }
        return available;
    }
}
