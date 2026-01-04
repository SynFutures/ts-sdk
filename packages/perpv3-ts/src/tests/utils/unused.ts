/**
 * UNUSED FUNCTIONS - Consolidated for removal
 *
 * These functions are not used anywhere in the codebase.
 * Moved here before deleting source files
 */

import {
    MAX_UINT_128,
    MAX_UINT_16,
    MAX_UINT_160,
    MAX_UINT_256,
    MAX_UINT_32,
    MAX_UINT_64,
    MAX_UINT_8,
    ONE,
    Q96,
    WAD,
    ZERO,
} from '../../constants';
import { abs, mulDiv, mulDivNearest, mulDivRoundingUp, ratioToWad, sqrtX96ToWad, wdiv, wmulUp } from '../../math';
import { Amm, FundFlow, Pending } from '../../types/contract';
import { Range } from '../../types/range';

// === FROM alpha.ts ===
export function alphaWadToNumber(alpha: bigint): number {
    if (alpha === 0n) return 0;
    return Number(alpha) / Number(WAD);
}

// === FROM calculation.ts ===
export function calcMaxWithdrawable(threshold: bigint, pending: Pending, fundFlow: FundFlow, reserve: bigint): bigint {
    const maxWithdrawable = threshold + pending.exemption - fundFlow.totalOut + fundFlow.totalIn - pending.amount;
    if (maxWithdrawable <= 0n) return 0n;
    if (maxWithdrawable > reserve) return reserve;
    return maxWithdrawable;
}

export const calcFundingRate = (amm: Amm, spotPrice: bigint, fundingHour: number): bigint => {
    if (spotPrice === 0n) {
        throw new Error('Spot price can not be zero');
    }

    const period = fundingHour * 3600;
    const ratio = wdiv(sqrtX96ToWad(amm.sqrtPX96), spotPrice) - WAD;
    const result = (ratio * 86_400n) / BigInt(period);

    return result;
};

export function withinDeviationLimit(fairPrice: bigint, markPrice: bigint, imr: number): boolean {
    return wdiv(abs(fairPrice - markPrice), markPrice) <= ratioToWad(imr);
}

export function isAmmWithinDeviationLimit(amm: Amm, markPrice: bigint, initialMarginRatio: number): boolean {
    return withinDeviationLimit(sqrtX96ToWad(amm.sqrtPX96), markPrice, initialMarginRatio);
}

export abstract class NumericConverter {
    static scaleQuoteAmount(amount: bigint, quoteDecimals: number): bigint {
        const quoteAmountScaler = BigInt(10) ** BigInt(18 - quoteDecimals);
        return amount * quoteAmountScaler;
    }

    static toContractQuoteAmount(amount: bigint, quoteDecimals: number): bigint {
        const quoteAmountScaler = BigInt(10) ** BigInt(18 - quoteDecimals);
        return amount / quoteAmountScaler;
    }

    static toContractRatio(ratioWad: bigint): bigint {
        return ratioWad / BigInt(10) ** BigInt(14);
    }
}

// === Helper functions for unused code ===

function getNextSqrtPriceFromAmount0RoundingUp(
    sqrtPX96: bigint,
    liquidity: bigint,
    amount: bigint,
    add: boolean
): bigint {
    if (amount === ZERO) {
        return sqrtPX96;
    }
    const numerator1 = liquidity << 96n;
    if (add) {
        const product = multiplyIn256(amount, sqrtPX96);
        if (product / amount === sqrtPX96) {
            const denominator = addIn256(numerator1, product);
            if (denominator >= numerator1) {
                return mulDivRoundingUp(numerator1, sqrtPX96, denominator);
            }
        }
        return mulDivRoundingUp(numerator1, ONE, numerator1 / sqrtPX96 + amount);
    }

    const product = multiplyIn256(amount, sqrtPX96);
    if (product / amount !== sqrtPX96) {
        throw new Error('PRECISION');
    }
    if (numerator1 <= product) {
        throw new Error('LIQUIDITY');
    }
    return mulDivRoundingUp(numerator1, sqrtPX96, numerator1 - product);
}

function getNextSqrtPriceFromAmount1RoundingDown(
    sqrtPX96: bigint,
    liquidity: bigint,
    amount: bigint,
    add: boolean
): bigint {
    if (add) {
        const quotient = amount <= MAX_UINT_160 ? (amount << 96n) / liquidity : mulDiv(amount, Q96, liquidity);
        return sqrtPX96 + quotient;
    }
    const quotient = mulDivRoundingUp(amount, Q96, liquidity);
    if (sqrtPX96 <= quotient) {
        throw new Error('UNDERFLOW');
    }
    return sqrtPX96 - quotient;
}

function getNextSqrtPriceFromDeltaBase(sqrtPX96: bigint, liquidity: bigint, amount: bigint, isLong: boolean): bigint {
    if (sqrtPX96 <= ZERO || liquidity <= ZERO) {
        throw new Error('SQRT or LIQ must be positive');
    }
    return getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amount, !isLong);
}

// === FROM swap.ts === ALL 5 FUNCTIONS UNUSED ===
export interface SwapImpact {
    sqrtPostPX96: bigint;
    dx: bigint;
    dy: bigint;
}

export function calcSwapResult(
    sqrtPX96: bigint,
    liquidity: bigint,
    amountIn: bigint,
    zeroForOne: boolean
): {
    amount0Delta: bigint;
    amount1Delta: bigint;
    nextSqrtPX96: bigint;
} {
    if (sqrtPX96 <= ZERO || liquidity <= ZERO) {
        throw new Error('Invalid input parameters');
    }
    if (amountIn === ZERO) {
        return { amount0Delta: ZERO, amount1Delta: ZERO, nextSqrtPX96: sqrtPX96 };
    }
    const nextSqrtPX96 = zeroForOne
        ? getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true)
        : getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
    // Create a temporary Range instance to use instance methods
    const tempRangeForSwap = new Range(0n, 0n, 0n, sqrtPX96, 0, 0);
    const amount0Delta = tempRangeForSwap.getDeltaBase(nextSqrtPX96, sqrtPX96, liquidity, zeroForOne);
    const amount1Delta = tempRangeForSwap.getDeltaQuote(nextSqrtPX96, sqrtPX96, liquidity, zeroForOne);
    return { amount0Delta, amount1Delta, nextSqrtPX96 };
}

export function calcSwapFee(amountIn: bigint, feeRate: bigint): bigint {
    if (amountIn <= ZERO || feeRate <= ZERO) return ZERO;
    return (amountIn * feeRate) / 10_000n;
}

export function calcPriceImpact(amountIn: bigint, liquidity: bigint): bigint {
    if (amountIn <= ZERO || liquidity <= ZERO) return ZERO;
    return (amountIn * Q96) / liquidity;
}

export function calcMinimumAmountOut(amountOut: bigint, slippageTolerance: bigint): bigint {
    if (amountOut <= ZERO || slippageTolerance <= ZERO) return amountOut;
    const slippageAmount = (amountOut * slippageTolerance) / 10_000n;
    return amountOut - slippageAmount;
}

export function swapWithinRange(
    sqrtCurrentPX96: bigint,
    sqrtTargetPX96: bigint,
    liquidity: bigint,
    sizeLeft: bigint
): SwapImpact {
    const long = sizeLeft > ZERO;
    // Create a temporary Range instance to use instance methods
    const tempRange = new Range(0n, 0n, 0n, sqrtCurrentPX96, 0, 0);
    const dxMax = tempRange.getDeltaBaseAutoRoundUp(sqrtTargetPX96, sqrtCurrentPX96, liquidity);
    let dxAbs = sizeLeft < ZERO ? -sizeLeft : sizeLeft;
    let sqrtPostPX96: bigint;
    if (dxAbs >= dxMax) {
        dxAbs = dxMax;
        sqrtPostPX96 = sqrtTargetPX96;
    } else {
        sqrtPostPX96 = getNextSqrtPriceFromDeltaBase(sqrtCurrentPX96, liquidity, dxAbs, long);
    }
    const dy = tempRange.getDeltaQuote(sqrtPostPX96, sqrtCurrentPX96, liquidity, long);
    const dx = long ? dxAbs : -dxAbs;
    return { sqrtPostPX96, dx, dy };
}

// === FROM bigint.ts === 9 UNUSED FUNCTIONS ===
export function mulDivRoundingDown(a: bigint, b: bigint, denominator: bigint): bigint {
    if (denominator === ZERO) throw new Error('DIVISION_BY_ZERO');
    return (a * b) / denominator;
}

export function roundHalfUp(x: bigint, y: bigint): bigint {
    const TWO = 2n;
    const half = y / TWO;
    return x > ZERO ? x + half : x - half;
}

export function safeWDiv(x: bigint, y: bigint): bigint {
    return y === ZERO ? ZERO : wdiv(x, y);
}

export function wmulInt(x: bigint, y: bigint): bigint {
    const WAD = 10n ** 18n;
    const HALF_WAD = WAD / 2n;
    let product = x * y;
    product += product < ZERO ? -HALF_WAD : HALF_WAD;
    return product / WAD;
}

export function weightedAverage(w1: bigint, x1: bigint, w2: bigint, x2: bigint): bigint {
    return (x1 * w1 + x2 * w2) / (w1 + w2);
}

export function maxAmongThree(a: bigint, b: bigint, c: bigint): bigint {
    return a > b ? (a > c ? a : c) : b > c ? b : c;
}

export function mulMod(x: bigint, y: bigint, modulus: bigint): bigint {
    return ((x % modulus) * (y % modulus)) % modulus;
}

export function fullMul(x: bigint, y: bigint): { l: bigint; h: bigint } {
    const MAX_UINT_256 = 2n ** 256n - 1n;
    const mm = mulMod(x, y, MAX_UINT_256);
    const l = x * y;
    let h = mm - l;
    if (mm < l) h -= 1n;
    return { l, h };
}

export function fullDiv(l: bigint, h: bigint, d: bigint): bigint {
    const MAX_UINT_256 = 2n ** 256n - 1n;
    const ONE = 1n;
    const TWO = 2n;
    const negd = MAX_UINT_256 - d + ONE;
    const pow2 = d & negd;
    const dReduced = d / pow2;
    let lReduced = l / pow2;
    const negPow2 = MAX_UINT_256 - pow2 + ONE;
    lReduced += h * (negPow2 / pow2 + ONE);
    let r = ONE;
    for (let i = 0; i < 8; i += 1) {
        r *= TWO - dReduced * r;
    }
    return lReduced * r;
}

export function sqrtWithPrecision(n: bigint, _precision: bigint): bigint {
    const TWO = 2n;
    let z = n;
    let x = n / TWO + 1n;
    while (x < z) {
        z = x;
        x = (n / x + x) / TWO;
    }
    return z;
}

// === FROM conversion.ts ===
export function wadToRatio(wad: bigint): bigint {
    const RATIO_SCALER = 10n ** 14n;
    return wad / RATIO_SCALER;
}

// === FROM numeric.ts ===
export function asUint96(x: number): number {
    return x;
}

// === FROM bigint.ts === (additional unused)
export function neg(x: bigint): bigint {
    return 0n - x;
}

export function oppositeSigns(x: bigint, y: bigint): boolean {
    return (x < 0n && y > 0n) || (x > 0n && y < 0n);
}

// === FROM tick.ts ===
export function calcTakenNotional(_tick: number, _size: bigint): bigint {
    // Copy implementation from tick.ts
    return 0n;
}

export function clampTick(tick: number): number {
    const MIN_TICK = -322517;
    const MAX_TICK = 443636;
    if (tick < MIN_TICK) return MIN_TICK;
    if (tick > MAX_TICK) return MAX_TICK;
    return tick;
}

// === FROM sqrtx96.ts ===
export function getNextSqrtPriceFromInput(
    sqrtPX96: bigint,
    liquidity: bigint,
    amountIn: bigint,
    zeroForOne: boolean
): bigint {
    if (sqrtPX96 <= ZERO || liquidity <= ZERO) {
        throw new Error('SQRT or LIQ must be positive');
    }
    return zeroForOne
        ? getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true)
        : getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
}

export function getNextSqrtPriceFromOutput(
    sqrtPX96: bigint,
    liquidity: bigint,
    amountOut: bigint,
    zeroForOne: boolean
): bigint {
    if (sqrtPX96 <= ZERO || liquidity <= ZERO) {
        throw new Error('SQRT or LIQ must be positive');
    }
    return zeroForOne
        ? getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountOut, false)
        : getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountOut, false);
}

export function getLiquidityFromMargin(
    sqrtEntryPX96: bigint,
    sqrtUpperPX96: bigint,
    entryMargin: bigint,
    initialMarginRatio: number
): bigint {
    if (sqrtEntryPX96 <= ZERO || sqrtUpperPX96 <= ZERO) {
        throw new Error('ENTRY or UPPER must be positive');
    }

    const numerator1 = entryMargin * sqrtUpperPX96;
    const numerator2 = sqrtEntryPX96;
    const denominator1 = sqrtUpperPX96 - sqrtEntryPX96;

    let temp = (numerator1 * numerator2) / denominator1;
    temp = mulDiv(temp, Q96, sqrtUpperPX96);

    const denominator2 = wmulUp(sqrtUpperPX96, ratioToWad(initialMarginRatio + 10000)) - sqrtEntryPX96;
    return temp / denominator2;
}

// === FROM position.ts ===
/**
 * Combine position entries
 * @deprecated Unused function - kept for reference
 */
export function combine(entryNotional1: bigint, size1: bigint, entryNotional2: bigint, size2: bigint): bigint {
    if (size1 === 0n) return entryNotional2;
    if (size2 === 0n) return entryNotional1;

    // If same direction, add notionals
    if ((size1 > 0n && size2 > 0n) || (size1 < 0n && size2 < 0n)) {
        return entryNotional1 + entryNotional2;
    }

    // If opposite directions, calculate weighted average
    const totalSize = size1 + size2;
    if (totalSize === 0n) return 0n;

    const absSize1 = size1 < 0n ? -size1 : size1;
    const absSize2 = size2 < 0n ? -size2 : size2;

    if (absSize1 >= absSize2) {
        return (entryNotional1 * (absSize1 - absSize2)) / absSize1;
    } else {
        return (entryNotional2 * (absSize2 - absSize1)) / absSize2;
    }
}

// === FROM math.ts ===
export function min(left: bigint, right: bigint): bigint {
    return left > right ? right : left;
}

export function signedDiv(x: number, y: number): number {
    return (x - (x % y)) / y;
}

export function leastSignificantBit(value: bigint): number {
    let r = 255;
    let cursor = value;
    if ((cursor & MAX_UINT_128) !== ZERO) {
        r -= 128;
    } else {
        cursor >>= 128n;
    }
    if ((cursor & MAX_UINT_64) !== ZERO) {
        r -= 64;
    } else {
        cursor >>= 64n;
    }
    if ((cursor & MAX_UINT_32) !== ZERO) {
        r -= 32;
    } else {
        cursor >>= 32n;
    }
    if ((cursor & MAX_UINT_16) !== ZERO) {
        r -= 16;
    } else {
        cursor >>= 16n;
    }
    if ((cursor & MAX_UINT_8) !== ZERO) {
        r -= 8;
    } else {
        cursor >>= 8n;
    }
    if ((cursor & 0xfn) !== ZERO) {
        r -= 4;
    } else {
        cursor >>= 4n;
    }
    if ((cursor & 0x3n) !== ZERO) {
        r -= 2;
    } else {
        cursor >>= 2n;
    }
    if ((cursor & ONE) !== ZERO) {
        r -= 1;
    }
    return r;
}

export function leastNonnegativeRemainder(x: number, modulus: number): number {
    return ((x % modulus) + modulus) % modulus;
}

export function leastNonnegativeComplement(x: number, modulus: number): number {
    return (modulus - (x % modulus)) % modulus;
}

export function proportion(value: bigint, part: bigint, total: bigint): bigint {
    if (total === ZERO) return ZERO;
    return mulDivNearest(value, part, total);
}

// === FROM math.ts (only used in unused.ts) ===
export function multiplyIn256(x: bigint, y: bigint): bigint {
    return (x * y) & MAX_UINT_256;
}

export function addIn256(x: bigint, y: bigint): bigint {
    return (x + y) & MAX_UINT_256;
}

// === FROM helpers.ts ===
import { wmul, tickToWad } from '../../math';

export interface UserMarginState {
    reserve: bigint;
    balance: bigint;
    allowance: bigint;
}

export function estimateAPY(
    amm: Amm,
    poolFee24h: bigint,
    tickDelta: number,
    minRangeValue: bigint,
    initialMarginRatio: number,
    rangeSpacing: number
): number {
    if (!amm || amm.liquidity === ZERO) {
        return 0;
    }
    const assumeAddMargin = minRangeValue;
    const spacing = rangeSpacing;

    const upperTick = spacing * Math.trunc((amm.tick + tickDelta) / spacing);
    const lowerTick = spacing * Math.trunc((amm.tick - tickDelta) / spacing);
    const tempRange = new Range(0n, 0n, 0n, amm.sqrtPX96, lowerTick, upperTick);
    const { liquidity: assumeAddLiquidity } = tempRange.calcEntryDelta(
        amm.sqrtPX96,
        assumeAddMargin,
        initialMarginRatio
    );
    const assumed24HrFee = (poolFee24h * assumeAddLiquidity) / amm.liquidity;
    const apyWad = wdiv(assumed24HrFee * 365n, assumeAddMargin);

    // Convert from WAD (18 decimals) to number
    return Number(apyWad) / Number(WAD);
}

/**
 * Evaluate whether the user has enough margin to cover the required amount.
 *
 * - Returns `allowanceGap` if additional transfer from wallet is needed and allowance is insufficient.
 * - Returns `marginGap` if even the wallet balance plus reserve is not enough.
 * - Both values will be 0n if sufficient margin is available.
 *
 * @param required - Required margin amount
 * @param current - Current user margin state
 * @returns Object containing allowanceGap and marginGap
 */
export function checkUserMargin(
    required: bigint,
    current: UserMarginState
): { allowanceGap: bigint; marginGap: bigint } {
    let allowanceGap = 0n;
    let marginGap = 0n;

    if (required <= 0n || required <= current.reserve) {
        return { allowanceGap, marginGap };
    }

    const available = current.reserve + current.balance;
    if (required > available) {
        marginGap = required - available;
        return { allowanceGap, marginGap };
    }

    const requiredTransfer = required - current.reserve;
    if (requiredTransfer > current.allowance) {
        allowanceGap = requiredTransfer - current.allowance;
    }

    return { allowanceGap, marginGap };
}

export function calcOrderLeverageByMargin(targetTick: number, baseQuantity: bigint, margin: bigint): bigint {
    return wdiv(wmul(tickToWad(targetTick), abs(baseQuantity)), margin);
}

// === FROM types/tx.ts ===
import type { Address, PublicClient, WalletClient, TransactionReceipt, TransactionRequest, Hash } from 'viem';
import type { ChainKit, TxRequest } from '@derivation-tech/viem-kit';

// Extend viem's TransactionRequest with custom context field
export interface BaseTxOptions extends Omit<TransactionRequest, 'to' | 'from'> {
    account?: Address;
    context?: Partial<TxExecutionContext>;
}

// Use viem's TransactionRequest for populate (not submitted)
export type PopulateTxOptions = BaseTxOptions & {
    submit?: false;
};

// Use viem's SendTransactionRequest pattern but extend with custom fields
export interface SendTxOptions extends Omit<TransactionRequest, 'to' | 'from'> {
    submit: true;
    account: Address;
    waitForReceipt?: boolean;
    context?: Partial<TxExecutionContext>;
}

export type TxOptions = PopulateTxOptions | SendTxOptions;

export type TxSender = (req: TxRequest, context: TxExecutionContext) => Promise<TransactionReceipt>;

export interface TxExecutionContext {
    kit: ChainKit;
    publicClient: PublicClient;
    walletClient?: WalletClient;
    send?: TxSender;
}

export interface SendTxResult {
    hash: Hash;
    receipt?: TransactionReceipt;
}

export type TxResult = TransactionRequest | SendTxResult;
