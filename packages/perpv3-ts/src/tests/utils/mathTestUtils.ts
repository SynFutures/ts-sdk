import { MAX_UINT_160, MAX_UINT_256, ONE, Q96, ZERO } from '../../constants';
import { abs, mulDiv, mulDivRoundingUp, tickToWad, wdiv, wmul } from '../../math';

function multiplyIn256(x: bigint, y: bigint): bigint {
    return (x * y) & MAX_UINT_256;
}

function addIn256(x: bigint, y: bigint): bigint {
    return (x + y) & MAX_UINT_256;
}

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

export function getNextSqrtPriceFromDeltaBase(
    sqrtPX96: bigint,
    liquidity: bigint,
    amount: bigint,
    isLong: boolean
): bigint {
    if (sqrtPX96 <= ZERO || liquidity <= ZERO) {
        throw new Error('SQRT or LIQ must be positive');
    }
    return getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amount, !isLong);
}

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

export function calcOrderLeverageByMargin(targetTick: number, baseQuantity: bigint, margin: bigint): bigint {
    return wdiv(wmul(tickToWad(targetTick), abs(baseQuantity)), margin);
}

