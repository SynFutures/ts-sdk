/**
 * Math operations for bigint and numeric types
 */

import { Errors, ErrorCode } from './types';
import {
    MAX_INT_24,
    MAX_SAFE_INTEGER,
    MAX_UINT_256,
    ONE,
    POWERS_OF_2,
    TWO,
    WAD,
    ZERO,
    Q96,
    Q32,
    MIN_TICK,
    MAX_TICK,
    MIN_SQRT_RATIO,
    MAX_SQRT_RATIO,
} from './constants';

function assertMath(condition: boolean, message: string, details?: Record<string, unknown>): void {
    if (!condition) {
        throw Errors.calculation(message, ErrorCode.CALCULATION_FAILED, details);
    }
}

// ============================================================================
// Numeric Conversions
// ============================================================================

export function asUint16(x: number): number {
    return x < 0 ? x + (1 << 16) : x;
}

export function asInt24(x: number): number {
    const maxInt24 = (1 << 23) - 1;
    return x > maxInt24 ? x - (1 << 24) : x;
}

export function asUint24(x: number): number {
    return x < 0 ? x + (1 << 24) : x;
}

export function asUint48(x: number): number {
    return x < 0 ? x + (1 << 48) : x;
}

export function asUint128(x: bigint): bigint {
    return x < 0n ? x + (ONE << 128n) : x;
}

export function asUint256(x: bigint): bigint {
    return x < 0n ? x + (ONE << 256n) : x;
}

export function forceAsInt24(x: bigint): bigint {
    const mask = (ONE << 24n) - ONE;
    let value = x & mask;
    if (value > MAX_INT_24) {
        value -= ONE << 24n;
    }
    return value;
}

export function asInt256(x: bigint): bigint {
    const maxInt256 = (ONE << 255n) - ONE;
    return x > maxInt256 ? x - (ONE << 256n) : x;
}

export function asInt128(x: bigint): bigint {
    const maxInt128 = (ONE << 127n) - ONE;
    return x > maxInt128 ? x - (ONE << 128n) : x;
}

// ============================================================================
// Shift Operations
// ============================================================================

function checkShiftAmount(n: number) {
    if (n < 0) {
        throw new Error("Shift amount 'n' must be a non-negative number for shift operations.");
    }
    if (n > 53) {
        throw new Error("Shift amount 'n' must be less than 53 for shift operations to avoid precision loss.");
    }
    if (Math.pow(2, n) > Number.MAX_SAFE_INTEGER) {
        throw new Error("Shift amount 'n' is too large for shift operations.");
    }
}

export function shiftLeft(x: number, n: number): number {
    checkShiftAmount(n);
    return x * Math.pow(2, n);
}

export function shiftRight(x: number, n: number): number {
    checkShiftAmount(n);
    return Math.floor(x / Math.pow(2, n));
}

// ============================================================================
// BigInt Operations
// ============================================================================

export function mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint): bigint {
    assertMath(denominator !== ZERO, 'DIVISION_BY_ZERO');
    const product = a * b;
    let result = product / denominator;
    if (product % denominator !== ZERO) {
        result += ONE;
    }
    return result;
}

export function mulShift(value: bigint, mulBy: string): bigint {
    return (value * BigInt(mulBy)) >> 128n;
}

export function max(left: bigint, right: bigint): bigint {
    return left > right ? left : right;
}

export function wmulInt(x: bigint, y: bigint): bigint {
    const HALF_WAD = WAD / 2n;
    let product = x * y;
    product += product < ZERO ? -HALF_WAD : HALF_WAD;
    return product / WAD;
}

export function mostSignificantBit(value: bigint): number {
    assertMath(value > ZERO, 'ZERO');
    assertMath(value <= MAX_UINT_256, 'MAX');

    let msb = 0;
    let cursor = value;
    for (const [power, threshold] of POWERS_OF_2) {
        if (cursor >= threshold) {
            cursor >>= BigInt(power);
            msb += power;
        }
    }
    return msb;
}

export function sqrt(value: bigint): bigint {
    assertMath(value >= ZERO, 'NEGATIVE');
    if (value <= MAX_SAFE_INTEGER) {
        return BigInt(Math.floor(Math.sqrt(Number(value))));
    }

    let z = value;
    let x = value / TWO + ONE;
    while (x < z) {
        z = x;
        x = (value / x + x) / TWO;
    }
    return z;
}

export function frac(x: bigint, y: bigint, w: bigint): bigint {
    return (x * y + w / TWO) / w;
}

export function wdiv(x: bigint, y: bigint): bigint {
    return frac(x, WAD, y);
}

export function wdivUp(x: bigint, y: bigint): bigint {
    return fracUp(x, WAD, y);
}

export function wdivDown(x: bigint, y: bigint): bigint {
    return fracDown(x, WAD, y);
}

export function wmul(x: bigint, y: bigint): bigint {
    return frac(x, y, WAD);
}

export function wmulUp(x: bigint, y: bigint): bigint {
    return fracUp(x, y, WAD);
}

export function wmulDown(x: bigint, y: bigint): bigint {
    return fracDown(x, y, WAD);
}

export function mulDiv(x: bigint, y: bigint, d: bigint): bigint {
    return (x * y) / d;
}

export function abs(value: bigint): bigint {
    return value < ZERO ? -value : value;
}

export function mulDivNearest(x: bigint, y: bigint, denominator: bigint): bigint {
    if (denominator === ZERO) {
        throw new Error('Division by zero in mulDivNearest');
    }
    const product = x * y;
    const half = denominator >> 1n;
    // Note: Always add half for rounding to nearest, matching the old SDK's frac() behavior
    // Old SDK: (x * y + w / 2) / w
    // This ensures consistent rounding behavior even for negative products
    return (product + half) / denominator;
}

// ============================================================================
// Price and Tick Conversions
// ============================================================================

export function ratioToWad(ratio: bigint | number | string): bigint {
    return BigInt(ratio) * 10n ** 14n;
}

export function sqrtX96ToWad(sqrtPX96: bigint): bigint {
    const px96 = mulDiv(sqrtPX96, sqrtPX96, Q96);
    return mulDiv(px96, WAD, Q96) + 1n;
}

export function wadToSqrtX96(price: bigint): bigint {
    const x96 = (price * Q96) / WAD;
    return sqrt(x96 * Q96);
}

export function tickToSqrtX96(tick: number): bigint {
    if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
        throw Errors.calculation('TICK', ErrorCode.INVALID_TICK, { tick });
    }
    const absTick = tick < 0 ? -tick : tick;

    const MAGIC = [
        '0xfffcb933bd6fad37aa2d162d1a594001',
        '0xfff97272373d413259a46990580e213a',
        '0xfff2e50f5f656932ef12357cf3c7fdcc',
        '0xffe5caca7e10e4e61c3624eaa0941cd0',
        '0xffcb9843d60f6159c9db58835c926644',
        '0xff973b41fa98c081472e6896dfb254c0',
        '0xff2ea16466c96a3843ec78b326b52861',
        '0xfe5dee046a99a2a811c461f1969c3053',
        '0xfcbe86c7900a88aedcffc83b479aa3a4',
        '0xf987a7253ac413176f2b074cf7815e54',
        '0xf3392b0822b70005940c7a398e4b70f3',
        '0xe7159475a2c29b7443b29c7fa6e889d9',
        '0xd097f3bdfd2022b8845ad8f792aa5825',
        '0xa9f746462d870fdf8a65dc1f90e061e5',
        '0x70d869a156d2a1b890bb3df62baf32f7',
        '0x31be135f97d08fd981231505542fcfa6',
        '0x9aa508b5b7a84e1c677de54f3e99bc9',
        '0x5d6af8dedb81196699c329225ee604',
        '0x2216e584f5fa1ea926041bedfe98',
        '0x48a170391f7dc42444e8fa2',
    ].map((value) => BigInt(value));

    let ratio = (absTick & 0x1) !== 0 ? MAGIC[0] : BigInt('0x100000000000000000000000000000000');
    for (let i = 1, bit = 0x2; i < MAGIC.length; i += 1, bit <<= 1) {
        if ((absTick & bit) !== 0) {
            ratio = mulShift(ratio, MAGIC[i].toString());
        }
    }

    if (tick > 0) {
        ratio = ((1n << 256n) - 1n) / ratio;
    }

    return ratio % Q32 > 0n ? ratio / Q32 + 1n : ratio / Q32;
}

export function sqrtX96ToTick(sqrtRatioX96: bigint): number {
    if (sqrtRatioX96 < MIN_SQRT_RATIO || sqrtRatioX96 >= MAX_SQRT_RATIO) {
        throw Errors.calculation('SQRT_RATIO', ErrorCode.CALCULATION_FAILED, { sqrtRatioX96: sqrtRatioX96.toString() });
    }

    const sqrtRatioX128 = sqrtRatioX96 << 32n;
    const msb = mostSignificantBit(sqrtRatioX128);

    let r: bigint;
    if (msb >= 128) {
        r = sqrtRatioX128 >> BigInt(msb - 127);
    } else {
        r = sqrtRatioX128 << BigInt(127 - msb);
    }

    let log2 = BigInt(msb - 128) << 64n;
    let unsignedLog2 = asUint256(log2);

    for (let i = 0; i < 14; i++) {
        r = (r * r) >> 127n;
        const f = r >> 128n;
        unsignedLog2 |= f << BigInt(63 - i);
        r >>= f;
    }

    log2 = asInt256(unsignedLog2);
    const logSqrt10001 = log2 * BigInt('255738958999603826347141');

    // Signed right shift: convert negative numbers to unsigned before shifting
    // This ensures proper arithmetic right shift behavior for negative values
    const signedShr = (number: bigint, bits: number): bigint => {
        const negative = number < 0n;
        const tmp = negative ? asUint256(number) : number;
        return tmp >> BigInt(bits);
    };

    const tickLow = Number(
        forceAsInt24(signedShr(logSqrt10001 - BigInt('3402992956809132418596140100660247210'), 128))
    );
    const tickHigh = Number(
        forceAsInt24(signedShr(logSqrt10001 + BigInt('291339464771989622907027621153398088495'), 128))
    );

    return tickLow === tickHigh ? tickLow : tickToSqrtX96(tickHigh) <= sqrtRatioX96 ? tickHigh : tickLow;
}

export function tickToWad(tick: number): bigint {
    return sqrtX96ToWad(tickToSqrtX96(tick));
}

export function wadToTick(priceWad: bigint): number {
    return sqrtX96ToTick(wadToSqrtX96(priceWad));
}

// Used by orderbook and other frontend-facing calculations.
// Kept as a named helper so consumers can reproduce SDK behaviors without copying internal query logic.
export function alphaWadToTickDelta(alphaWad: bigint): number {
    return wadToTick(alphaWad) + 1;
}

// Internal helper functions (not exported, only used internally)
function fracUp(x: bigint, y: bigint, w: bigint): bigint {
    return (x * y + (w - ONE)) / w;
}

function fracDown(x: bigint, y: bigint, w: bigint): bigint {
    return (x * y) / w;
}
