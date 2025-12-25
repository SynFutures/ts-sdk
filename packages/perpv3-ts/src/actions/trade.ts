import type { Address } from 'viem';
import { abs } from '../math';
import { ZERO } from '../constants';
import {
    Errors,
    ErrorCode,
    Position,
    QuotationWithSize,
    UserSetting,
    Side,
    sideSign,
    type PairSnapshot,
    type TradeParam,
} from '../types';

// ============================================================================
// Trade Input Classes
// ============================================================================

export class TradeInput {
    public readonly traderAddress: Address;

    public readonly side: Side;
    public readonly baseQuantity: bigint;

    /**
     * If provided, uses this margin directly (WAD). If omitted, margin is computed from `userSetting.leverage`.
     */
    public readonly margin?: bigint;

    constructor(traderAddress: Address, baseQuantity: bigint, side: Side, margin?: bigint) {
        if (baseQuantity <= 0n) {
            throw Errors.validation('Trade quantity must be positive', ErrorCode.INVALID_SIZE, {
                baseQuantity: baseQuantity.toString(),
            });
        }
        this.traderAddress = traderAddress;
        this.baseQuantity = baseQuantity;
        this.side = side;
        this.margin = margin;
    }

    /**
     * Simulate a market trade with full validation.
     * Returns [TradeParam, TradeSimulation] tuple.
     * Access quotation-related fields via the QuotationWithSize parameter.
     *
     * Note: Use the returned TradeParam for calldata encoding. Its `amount` is finalized by simulation
     * (it may be adjusted to satisfy margin/leverage constraints).
     */
    simulate(
        snapshot: PairSnapshot,
        quotationWithSize: QuotationWithSize,
        userSetting: UserSetting
    ): [TradeParam, TradeSimulation] {
        // Step 1: Extract context and validate inputs as early as possible
        const { instrumentSetting } = snapshot;
        const currentPosition = snapshot.portfolio.position;
        const markPrice = snapshot.priceData.markPrice;

        // Validate leverage first (before any calculations)
        userSetting.validateLeverage(instrumentSetting.maxLeverage);

        // Validate trade context (condition, status, price deviation, min trade value)
        snapshot.validateTradeContext(quotationWithSize, currentPosition);

        // Step 2: Update AMM funding indices (after validations pass)
        const updatedAmm = snapshot.updateAmmFundingIndex();

        // Step 3: Build trade parameters
        const tradeParam = this.toTradeParam(quotationWithSize, snapshot.expiry, userSetting);
        const isLong = tradeParam.size >= ZERO;
        const tradeSign = isLong ? 1n : -1n;

        // Step 4: Calculate required margin delta (positive = deposit, negative = withdraw)
        let marginDelta: bigint;
        if (this.margin !== undefined) {
            marginDelta = this.margin;
        } else {
            marginDelta = currentPosition.marginForTargetLeverage(
                updatedAmm,
                tradeParam,
                quotationWithSize,
                userSetting.leverage
            );
        }

        // Step 5: Create trade position and combine with current position
        const quotation = quotationWithSize.quotation;
        const tradeSize = tradeSign * quotationWithSize.baseQuantity;
        const tradeBalance = marginDelta < ZERO ? -quotation.fee : marginDelta - quotation.fee;
        const socialLossIndex = isLong ? updatedAmm.longSocialLossIndex : updatedAmm.shortSocialLossIndex;
        const fundingIndex = isLong ? updatedAmm.longFundingIndex : updatedAmm.shortFundingIndex;

        const tradePosition = new Position(
            tradeBalance,
            tradeSize,
            quotation.entryNotional,
            socialLossIndex,
            fundingIndex
        );
        const { position: combinedPosition, realized } = Position.combine(updatedAmm, currentPosition, tradePosition);

        // Step 6: Adjust margin delta if needed (handle negative margin withdrawal case)
        let postPosition = combinedPosition;
        let marginAdjusted = false;

        if (postPosition.size !== ZERO && marginDelta < ZERO) {
            // Create updated snapshot with updated AMM and postPosition for max withdrawable calculation
            const updatedSnapshot = snapshot.with({
                amm: updatedAmm,
                portfolio: { ...snapshot.portfolio, position: postPosition },
            });
            const maxWithdrawable = updatedSnapshot.getMaxWithdrawableMargin();

            if (abs(marginDelta) > maxWithdrawable) {
                if (userSetting.strictMode) {
                    throw Errors.simulation(
                        'Withdrawal amount exceeds maximum withdrawable margin',
                        ErrorCode.SIMULATION_FAILED
                    );
                }
                marginDelta = -maxWithdrawable;
                marginAdjusted = true;
            }

            postPosition = postPosition.withBalanceDelta(marginDelta);
        }

        // Step 7: Validate margin requirements (MMR for closing, IMR for opening/increasing)
        // Determine if this trade is closing or reducing the position
        const isPositionClosed = postPosition.size === ZERO;
        const isOppositeSide = currentPosition.size * tradeSign < ZERO;
        const isReducing = quotationWithSize.baseQuantity < abs(currentPosition.size);
        const isClosingPosition = isPositionClosed || (isOppositeSide && isReducing);

        if (isClosingPosition) {
            // Closing or reducing position: check MMR
            if (!postPosition.isMmrSafe(updatedAmm, instrumentSetting.mmr, markPrice)) {
                throw Errors.insufficientMargin(0n, 0n);
            }
        } else {
            // Opening or increasing position: check IMR
            if (!postPosition.isImrSafe(updatedAmm, instrumentSetting.imr, true, markPrice)) {
                if (userSetting.strictMode) {
                    throw Errors.simulation('Exceed max leverage', ErrorCode.SIMULATION_FAILED);
                }
                // Auto-adjust margin to meet IMR requirements
                const additionalMargin = postPosition.additionMarginToIMRSafe(
                    updatedAmm,
                    instrumentSetting.imr,
                    true,
                    userSetting.slippage,
                    markPrice
                );
                postPosition = postPosition.withBalanceDelta(additionalMargin);
                marginDelta += additionalMargin;
                marginAdjusted = true;
            }
        }

        // Step 8: Finalize trade parameters and build simulation result
        // If position closed with positive balance, withdraw all remaining balance
        if (postPosition.size === ZERO && postPosition.balance > ZERO) {
            marginDelta = -postPosition.balance;
        }
        tradeParam.amount = marginDelta;

        const simulation: TradeSimulation = {
            realized,
            postPosition,
            marginAdjusted,
        };

        return [tradeParam, simulation];
    }

    private toTradeParam(quotationWithSize: QuotationWithSize, expiry: number, userSetting: UserSetting): TradeParam {
        const tradePrice = quotationWithSize.tradePrice;
        const limitTick = userSetting.getTradeLimitTick(tradePrice, this.side);
        const deadline = userSetting.getDeadline();

        return {
            expiry,
            size: abs(this.baseQuantity) * BigInt(sideSign(this.side)),
            amount: this.margin ?? ZERO,
            limitTick,
            deadline,
        };
    }
}

// ============================================================================
// Trade Type Definitions
// ============================================================================
export interface TradeSimulation {
    /**
     * Realized PnL from closing part of a position.
     * Non-zero only when trading opposite side or partially closing a position.
     */
    realized: bigint;
    /**
     * Position state after the trade.
     */
    postPosition: Position;
    /**
     * Whether the margin was automatically adjusted from the requested amount.
     * Set to true when:
     * - Withdrawal amount exceeds maximum withdrawable margin (adjusted to max withdrawable)
     * - Position exceeds IMR and additional margin is auto-added to meet requirements
     */
    marginAdjusted: boolean;
    /**
     * Note: The margin delta can be obtained from `tradeParam.amount` (they are always equal).
     * `tradeParam.amount` is the final margin adjustment after all validations and auto-adjustments.
     */
}
