import { abs, frac, ratioToWad, tickToWad, wdiv, wdivDown, wdivUp, wmul, wmulDown, wmulInt, wmulUp } from '../math';
import { ONE_RATIO, ZERO } from '../constants';
import { PERP_EXPIRY, type Amm, type TradeParam } from './contract';
import type { QuotationWithSize } from './quotation';

export class Position {
    constructor(
        public balance: bigint, // int128
        public size: bigint, // int128
        public entryNotional: bigint, // uint128
        public entrySocialLossIndex: bigint, // uint128
        public entryFundingIndex: bigint // int128
    ) {}

    /**
     * Create an empty Position with all fields set to zero.
     * Useful for initializing positions when no position exists.
     */
    static empty(): Position {
        return new Position(0n, 0n, 0n, 0n, 0n);
    }

    /**
     * Ensure a Position object is a Position instance.
     * If it's already an instance, returns it. Otherwise creates a new instance from the plain object.
     * Useful when Position objects may have been cloned/serialized and lost their methods (e.g., from structuredClone in tests).
     */
    static ensureInstance(
        position:
            | Position
            | {
                  balance: bigint;
                  size: bigint;
                  entryNotional: bigint;
                  entrySocialLossIndex: bigint;
                  entryFundingIndex: bigint;
              }
    ): Position {
        return position instanceof Position
            ? position
            : new Position(
                  position.balance,
                  position.size,
                  position.entryNotional,
                  position.entrySocialLossIndex,
                  position.entryFundingIndex
              );
    }

    fundingFee(amm: Amm): bigint {
        if (amm.expiry !== PERP_EXPIRY || this.size === ZERO) {
            return ZERO;
        }
        const delta = (this.size >= ZERO ? amm.longFundingIndex : amm.shortFundingIndex) - this.entryFundingIndex;
        if (delta === ZERO) {
            return ZERO;
        }
        return wmulInt(delta, abs(this.size));
    }

    socialLoss(amm: Amm): bigint {
        const delta =
            (this.size >= ZERO ? amm.longSocialLossIndex : amm.shortSocialLossIndex) - this.entrySocialLossIndex;
        if (delta === ZERO || this.size === ZERO) {
            return ZERO;
        }
        return wmulUp(delta, abs(this.size));
    }

    pricePnl(price: bigint): bigint {
        if (this.size === ZERO) {
            return ZERO;
        }
        const value = wmul(price, abs(this.size));
        if (this.size > ZERO) {
            return value - this.entryNotional;
        } else {
            return this.entryNotional - value;
        }
    }

    /**
     * Calculate total PnL (price PnL + funding fee - social loss)
     */
    pnl(amm: Amm, price: bigint): bigint {
        if (this.size === ZERO) {
            return ZERO;
        }
        const pricePnlValue = this.pricePnl(price);
        const fundingFee = this.fundingFee(amm);
        const socialLoss = this.socialLoss(amm);
        return pricePnlValue + fundingFee - socialLoss;
    }

    /**
     * Calculate position equity (balance + PnL)
     *
     * When `increase` is true (increasing position in the same direction), unrealized profit
     * cannot be counted as support margin - only unrealized loss can be counted. This is because
     * unrealized profit is not yet realized and cannot be used to support additional margin requirements.
     *
     * When `increase` is false (default), we use the full equity (balance + all unrealized PnL).
     */
    equity(amm: Amm, price: bigint, increase: boolean = false): bigint {
        if (this.size === ZERO) {
            return this.balance;
        }
        if (increase) {
            const unrealizedPnl = this.pnl(amm, price);
            const unrealizedLoss = unrealizedPnl < ZERO ? unrealizedPnl : ZERO;
            return this.balance + unrealizedLoss;
        } else {
            return this.balance + this.pnl(amm, price);
        }
    }

    /**
     * Calculate position leverage
     */
    leverage(amm: Amm, price: bigint): bigint {
        if (this.size === ZERO) return ZERO;

        const equity = this.equity(amm, price);
        if (equity <= ZERO) return ZERO;

        const notional = wmul(abs(this.size), price);
        return wdiv(notional, equity);
    }

    /**
     * Calculate margin required to achieve a target leverage after a trade.
     * Margin = post-equity - pre-equity + trade-loss + trading-fees
     * where post-equity = notional / target-leverage
     *
     * Trade loss is calculated internally based on worst-case slippage:
     * Trade loss = difference between worst notional (at limit price) and mark notional.
     *
     * When reducing or closing positions, this function still targets `targetLeverage` (if position remains open).
     * This means margin can become negative (withdrawal) to keep the post-trade leverage at the selected level.
     *
     * @param amm - AMM state (for calculating pre-equity)
     * @param tradeParam - Trade parameters containing size and limitTick
     * @param quotationWithSize - Quotation with base size (contains mark price and fee)
     * @param targetLeverage - Target leverage to achieve (in WAD)
     * @returns Required margin (positive = deposit, negative = withdraw, 0 = no change)
     */
    marginForTargetLeverage(
        amm: Amm,
        tradeParam: TradeParam,
        quotationWithSize: QuotationWithSize,
        targetLeverage: bigint
    ): bigint {
        const markPrice = quotationWithSize.quotation.mark;
        const quotationFee = quotationWithSize.quotation.fee;
        const preEquity = this.equity(amm, markPrice);
        const tradeSize = tradeParam.size;
        const postSize = this.size + tradeSize;

        // Calculate trade loss based on worst-case slippage
        const sign = tradeSize >= ZERO ? 1n : -1n;
        const limitPrice = tickToWad(tradeParam.limitTick);
        const worstNotional = wmul(limitPrice, quotationWithSize.baseQuantity);
        const markNotional = wmul(markPrice, quotationWithSize.baseQuantity);
        const tradeLoss = sign > ZERO ? worstNotional - markNotional : markNotional - worstNotional;

        // Full close: ensure worst-case (limit price) equity is non-negative.
        // If preEquity is insufficient to cover tradeLoss + fee, user must transfer in extra margin.
        // Otherwise, no explicit transfer is needed and remaining margin will be gathered by Gate.
        if (postSize === ZERO) {
            const requiredMargin = tradeLoss + quotationFee - preEquity;
            return requiredMargin > ZERO ? requiredMargin : ZERO;
        }

        if (targetLeverage <= ZERO) {
            return ZERO;
        }

        const postEquity = wdiv(wmul(markPrice, abs(postSize)), targetLeverage);
        return postEquity - preEquity + tradeLoss + quotationFee;
    }

    /**
     * Create a new Position with adjusted balance.
     * Useful for margin adjustments without changing other position properties.
     */
    withBalanceDelta(delta: bigint): Position {
        return new Position(
            this.balance + delta,
            this.size,
            this.entryNotional,
            this.entrySocialLossIndex,
            this.entryFundingIndex
        );
    }

    /**
     * Calculate maximum withdrawable margin from position
     */
    maxWithdrawable(amm: Amm, initialMarginRatio: number, price: bigint): bigint {
        const pnl = this.pnl(amm, price);
        const socialLoss = this.socialLoss(amm);
        const fundingFee = this.fundingFee(amm);

        const purePnl = pnl + socialLoss - fundingFee;
        const unrealizedLoss = purePnl > ZERO ? ZERO : purePnl - socialLoss;

        const positionValue = wmulUp(price, abs(this.size));
        const imRequirement = wmulUp(positionValue, ratioToWad(initialMarginRatio));
        const withdrawable = this.balance + unrealizedLoss - imRequirement;

        return withdrawable > ZERO ? withdrawable : ZERO;
    }

    /**
     * Calculate additional margin needed to make position IM safe
     */
    additionMarginToIMRSafe(
        amm: Amm,
        initialMarginRatio: number,
        increase: boolean,
        slippage: number = 0,
        price: bigint
    ): bigint {
        const notional = wmul(abs(this.size), price);
        let requiredMargin = wmulUp(notional, ratioToWad(initialMarginRatio));

        if (slippage) {
            const slip = BigInt(slippage);
            requiredMargin = (requiredMargin * (ONE_RATIO + slip)) / ONE_RATIO;
        }

        const equity = this.equity(amm, price, increase);
        const deficit = requiredMargin - equity;
        return deficit > ZERO ? deficit : ZERO;
    }

    /**
     * Check if position is Initial Margin Ratio safe
     */
    isImrSafe(amm: Amm, initialMarginRatio: number, increase: boolean, price: bigint): boolean {
        if (this.size === ZERO) return true;

        const equity = this.equity(amm, price, increase);
        if (equity <= ZERO) return false;

        const positionValue = wmul(abs(this.size), price);
        const requiredMargin = wmulUp(positionValue, ratioToWad(initialMarginRatio));

        return equity >= requiredMargin;
    }

    /**
     * Check if position is Maintenance Margin Ratio safe
     */
    isMmrSafe(amm: Amm, maintenanceMarginRatio: number, price: bigint): boolean {
        if (this.size === ZERO) return true;

        const equity = this.equity(amm, price);
        if (equity <= ZERO) return false;

        const positionValue = wmul(abs(this.size), price);
        const requiredMargin = wmulUp(positionValue, ratioToWad(maintenanceMarginRatio));

        return equity >= requiredMargin;
    }

    liquidationPrice(amm: Amm, mmr: number): bigint {
        if (this.size === ZERO) {
            return ZERO;
        }
        const socialLoss = this.socialLoss(amm);
        const fundingFee = this.fundingFee(amm);

        // At liquidation: equity = requiredMargin
        // equity = balance + pricePnl(liquidationPrice) + fundingFee - socialLoss
        // For long: pricePnl = liquidationPrice * size - entryNotional
        // For short: pricePnl = entryNotional - liquidationPrice * size
        // Solving for liquidationPrice:
        if (this.size > ZERO) {
            // liquidationPrice * size = entryNotional + requiredMargin - balance - fundingFee + socialLoss
            // liquidationPrice = (entryNotional + socialLoss - balance - fundingFee) / (size * (1 - mmr/10000))
            const numerator = this.entryNotional + socialLoss - this.balance - fundingFee;
            if (numerator <= ZERO) return ZERO;
            return wdivDown(numerator, wmulUp(abs(this.size), ratioToWad(10_000 - mmr)));
        } else {
            // liquidationPrice * size = entryNotional - requiredMargin + balance + fundingFee - socialLoss
            // liquidationPrice = (entryNotional - socialLoss + balance + fundingFee) / (size * (1 + mmr/10000))
            const numerator = this.entryNotional - socialLoss + this.balance + fundingFee;
            if (numerator <= ZERO) return ZERO;
            return wdivUp(numerator, wmulDown(abs(this.size), ratioToWad(10_000 + mmr)));
        }
    }

    transferAmountFromTargetLeverage(amm: Amm, targetLeverage: bigint, price: bigint): bigint {
        const notional = wmul(abs(this.size), price);
        const targetEquity = wdiv(notional, targetLeverage);
        const currentEquity = this.equity(amm, price);
        return targetEquity - currentEquity;
    }

    /**
     * Check if the position can be adjusted to a target leverage.
     */
    canAdjustToLeverage(targetLeverage: bigint, amm: Amm, markPrice: bigint, initialMarginRatio: number): boolean {
        if (targetLeverage <= 0n) {
            return false;
        }

        const marginDelta = this.transferAmountFromTargetLeverage(amm, targetLeverage, markPrice);

        // If withdrawal, check if it exceeds maxWithdrawable
        if (marginDelta < ZERO) {
            const maxWithdrawable = this.maxWithdrawable(amm, initialMarginRatio, markPrice);
            return abs(marginDelta) <= maxWithdrawable;
        }

        // Deposit is always allowed
        return true;
    }

    /**
     * Combine two positions into one
     */
    static combine(
        amm: Amm,
        position_1: Position,
        position_2: Position
    ): { position: Position; closedSize: bigint; realized: bigint } {
        let position1 = new Position(
            position_1.balance,
            position_1.size,
            position_1.entryNotional,
            position_1.entrySocialLossIndex,
            position_1.entryFundingIndex
        );
        let position2 = new Position(
            position_2.balance,
            position_2.size,
            position_2.entryNotional,
            position_2.entrySocialLossIndex,
            position_2.entryFundingIndex
        );
        let realized = ZERO;

        if (amm.expiry === PERP_EXPIRY) {
            const { position: realizedPosition1, pnl: realizedPnl1 } = Position.realizeFundingFee(amm, position1);
            const { position: realizedPosition2, pnl: realizedPnl2 } = Position.realizeFundingFee(amm, position2);
            position1 = realizedPosition1;
            position2 = realizedPosition2;
            realized = realized + realizedPnl1;
            realized = realized + realizedPnl2;
        }

        const { position: realizedPosition1, socialLoss: socialLoss1 } = Position.realizeSocialLoss(amm, position1);
        const { position: realizedPosition2, socialLoss: socialLoss2 } = Position.realizeSocialLoss(amm, position2);
        position1 = realizedPosition1;
        position2 = realizedPosition2;
        realized = realized - socialLoss1;
        realized = realized - socialLoss2;

        if (position1.size === ZERO || position2.size === ZERO) {
            const merged = position1.size === ZERO ? position2 : position1;
            merged.balance = position1.balance + position2.balance;
            return { position: merged, closedSize: ZERO, realized };
        }

        const combinedSize = position1.size + position2.size;
        const combined = new Position(ZERO, combinedSize, ZERO, ZERO, ZERO);

        let closedSize = ZERO;
        if (position1.size * position2.size < ZERO) {
            closedSize = abs(position1.size) < abs(position2.size) ? abs(position1.size) : abs(position2.size);

            const longPos: Position = position1.size > ZERO ? position1 : position2;
            const shortPos: Position = position1.size > ZERO ? position2 : position1;
            let closedLongNotional: bigint;
            let closedShortNotional: bigint;

            if (combinedSize > ZERO) {
                closedLongNotional = frac(longPos.entryNotional, closedSize, longPos.size);
                closedShortNotional = shortPos.entryNotional;
                combined.entryNotional = longPos.entryNotional - closedLongNotional;
                combined.entrySocialLossIndex = longPos.entrySocialLossIndex;
                combined.entryFundingIndex = longPos.entryFundingIndex;
            } else if (combinedSize < ZERO) {
                closedLongNotional = longPos.entryNotional;
                closedShortNotional = frac(shortPos.entryNotional, closedSize, abs(shortPos.size));
                combined.entryNotional = shortPos.entryNotional - closedShortNotional;
                combined.entrySocialLossIndex = shortPos.entrySocialLossIndex;
                combined.entryFundingIndex = shortPos.entryFundingIndex;
            } else {
                closedLongNotional = longPos.entryNotional;
                closedShortNotional = shortPos.entryNotional;
            }
            const realizedPnl = closedShortNotional - closedLongNotional;
            combined.balance = longPos.balance + shortPos.balance + realizedPnl;
            realized += realizedPnl;
        } else {
            combined.entryNotional = position1.entryNotional + position2.entryNotional;
            combined.entrySocialLossIndex = combinedSize > ZERO ? amm.longSocialLossIndex : amm.shortSocialLossIndex;
            combined.entryFundingIndex = position1.size > ZERO ? amm.longFundingIndex : amm.shortFundingIndex;
            combined.balance = position1.balance + position2.balance;
        }

        return { position: combined, closedSize, realized };
    }

    private static realizeFundingFee(amm: Amm, original: Position): { position: Position; pnl: bigint } {
        const funding = original.fundingFee(amm);
        if (funding === ZERO || original.size === ZERO) {
            return {
                position: new Position(
                    original.balance,
                    original.size,
                    original.entryNotional,
                    original.entrySocialLossIndex,
                    original.entryFundingIndex
                ),
                pnl: ZERO,
            };
        }

        const position = new Position(
            original.balance + funding,
            original.size,
            original.entryNotional,
            original.entrySocialLossIndex,
            original.size > ZERO ? amm.longFundingIndex : amm.shortFundingIndex
        );
        return { position, pnl: funding };
    }

    private static realizeSocialLoss(amm: Amm, original: Position): { position: Position; socialLoss: bigint } {
        const socialLoss = original.socialLoss(amm);
        if (socialLoss === ZERO || original.size === ZERO) {
            return {
                position: new Position(
                    original.balance,
                    original.size,
                    original.entryNotional,
                    original.entrySocialLossIndex,
                    original.entryFundingIndex
                ),
                socialLoss: ZERO,
            };
        }

        const position = new Position(
            original.balance - socialLoss,
            original.size,
            original.entryNotional,
            original.size > ZERO ? amm.longSocialLossIndex : amm.shortSocialLossIndex,
            original.entryFundingIndex
        );
        return { position, socialLoss };
    }
}
