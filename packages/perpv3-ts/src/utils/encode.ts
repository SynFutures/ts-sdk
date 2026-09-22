import { Hex, isAddress, padHex, toHex } from 'viem';
import { EMPTY_TICK, MAX_BATCH_ORDER_COUNT, RATIO_BASE, ZERO } from '../constants';
import { asUint128, asUint16, asUint24, asUint48 } from '../math';
import {
    Errors,
    MAX_CANCEL_ORDER_COUNT,
    type AddParam,
    type AdjustParam,
    type BatchCancelParam,
    type FillParam,
    type PlaceParam,
    type RemoveParam,
    type TradeParam,
} from '../types';

// ============================================================================
// Exported Functions
// ============================================================================

export function encodeTradeParam(tradeParam: TradeParam): readonly [Hex, Hex] {
    return encodeParamForTradeAndPlace(tradeParam);
}

export function encodePlaceParam(placeParam: PlaceParam): readonly [Hex, Hex] {
    return encodeParamForTradeAndPlace({ ...placeParam, limitTick: placeParam.tick });
}

export function encodeDepositParam(token: string, quantity: bigint): Hex {
    return encodeParamForDepositAndWithdraw(token, quantity);
}

export function encodeWithdrawParam(token: string, quantity: bigint): Hex {
    return encodeParamForDepositAndWithdraw(token, quantity);
}

export function encodeAdjustParam(adjustParam: AdjustParam): readonly [Hex, Hex] {
    return encodeParamForTradeAndPlace({
        expiry: adjustParam.expiry,
        size: ZERO,
        amount: adjustParam.net,
        limitTick: 0,
        deadline: adjustParam.deadline,
    }) as readonly [Hex, Hex];
}

export function encodeAddParam(addParam: AddParam): readonly [Hex, Hex] {
    validateTiming(addParam);
    assertIntegerRange(addParam.amount, 128, false, 'amount');
    assertIntegerRange(addParam.tickDeltaLower, 24, false, 'tickDeltaLower');
    assertIntegerRange(addParam.tickDeltaUpper, 24, false, 'tickDeltaUpper');
    const uTick = asUint48(addParam.limitTicks);
    assertIntegerRange(uTick, 48, false, 'limitTicks');
    const combinedTick = (BigInt(uTick) << 32n) + BigInt(addParam.expiry);
    const combinedDeadline = (BigInt(addParam.deadline) << 80n) + combinedTick;
    const combinedAmount =
        (BigInt(addParam.tickDeltaLower) << 152n) + (BigInt(addParam.tickDeltaUpper) << 128n) + BigInt(addParam.amount);

    const page0 = pad32(combinedDeadline);
    const page1 = pad32(combinedAmount);
    return [page0, page1] as const;
}

export function encodeRemoveParam(removeParam: RemoveParam): readonly [Hex, Hex] {
    validateTiming(removeParam);
    validateAddress(removeParam.target);
    assertIntegerRange(removeParam.tickLower, 24, true, 'tickLower');
    assertIntegerRange(removeParam.tickUpper, 24, true, 'tickUpper');
    const uTick = asUint48(removeParam.limitTicks);
    assertIntegerRange(uTick, 48, false, 'limitTicks');
    const combinedTick = (BigInt(uTick) << 32n) + BigInt(removeParam.expiry);
    const combinedDeadline = (BigInt(removeParam.deadline) << 80n) + combinedTick;

    const uTickLower = asUint24(removeParam.tickLower);
    const uTickUpper = asUint24(removeParam.tickUpper);
    const combinedTickLower = (BigInt(uTickLower) << 160n) + BigInt(removeParam.target);
    const combinedTickUpper = (BigInt(uTickUpper) << 184n) + combinedTickLower;

    const page0 = pad32(combinedDeadline);
    const page1 = pad32(combinedTickUpper);
    return [page0, page1] as const;
}

export function encodeBatchPlaceParam({
    expiry,
    size,
    leverage,
    ticks,
    ratios,
    deadline,
}: {
    expiry: number;
    size: bigint;
    leverage: bigint;
    ticks: number[];
    ratios: number[];
    deadline: number;
}): readonly [Hex, Hex, Hex] {
    if (ticks.length > MAX_BATCH_ORDER_COUNT) {
        throw Errors.encoding(`cannot place more than ${MAX_BATCH_ORDER_COUNT} orders at once`, { ticks });
    }
    if (ticks.length !== ratios.length) {
        throw Errors.encoding('ticks and ratios length mismatch', { ticks, ratios });
    }
    if (ratios.reduce((acc, curr) => acc + curr, 0) !== RATIO_BASE) {
        throw Errors.encoding('ratios sum must be 10000', ratios);
    }

    validateTiming({ expiry, deadline });
    assertIntegerRange(size, 128, true, 'size');
    assertIntegerRange(leverage, 128, true, 'leverage');
    ticks.forEach((tick) => assertIntegerRange(tick, 24, true, 'tick'));
    ratios.forEach((ratio) => assertIntegerRange(ratio, 16, false, 'ratio'));
    const usize = BigInt(asUint128(size));
    const uLeverage = BigInt(asUint128(leverage));
    const combinedSize = (usize << 128n) + uLeverage;
    const page2 = pad32(combinedSize);

    let tmp0 = (BigInt(deadline) << 32n) + BigInt(expiry);
    for (let i = 0; i < 3; i++) {
        const uTick = i < ticks.length ? asUint24(ticks[i]) : Number(EMPTY_TICK);
        const uRatio = i < ratios.length ? asUint16(ratios[i]) : 0;
        tmp0 += BigInt(uRatio) << BigInt(64 + 40 * i);
        tmp0 += BigInt(uTick) << BigInt(64 + 40 * i + 16);
    }
    const page0 = padHex(toHex(tmp0), { size: 32 });

    let tmp1 = ZERO;
    for (let i = 0; i < 6; i++) {
        const uTick = i + 3 < ticks.length ? asUint24(ticks[i + 3]) : Number(EMPTY_TICK);
        const uRatio = i + 3 < ratios.length ? asUint16(ratios[i + 3]) : 0;
        tmp1 += BigInt(uRatio) << BigInt(40 * i);
        tmp1 += BigInt(uTick) << BigInt(40 * i + 16);
    }
    const page1 = pad32(tmp1);

    return [page0, page1, page2] as const;
}

export function encodeFillParam(param: FillParam): Hex {
    assertIntegerRange(param.expiry, 32, false, 'expiry');
    assertIntegerRange(param.nonce, 24, false, 'nonce');
    assertIntegerRange(param.tick, 24, true, 'tick');
    validateAddress(param.target);
    const uTick = asUint24(param.tick);
    const combinedTarget = (BigInt(param.target) << 32n) + BigInt(param.expiry);
    const combinedTick = (BigInt(uTick) << 192n) + combinedTarget;
    const combined = (BigInt(param.nonce) << 216n) + combinedTick;
    return pad32(combined);
}

export function encodeCancelParam(param: BatchCancelParam): Hex {
    const { ticks, expiry, deadline } = param;
    if (ticks.length < 1 || ticks.length > MAX_CANCEL_ORDER_COUNT) {
        throw Errors.encoding(`ticks length must be between 1 and ${MAX_CANCEL_ORDER_COUNT}`, { ticks });
    }
    validateTiming(param);
    ticks.forEach((tick) => assertIntegerRange(tick, 24, true, 'tick'));
    let encodedTicks = ZERO;
    for (let i = 0; i < MAX_CANCEL_ORDER_COUNT; i++) {
        const tick = i < ticks.length ? ticks[i] : Number(EMPTY_TICK);
        encodedTicks += BigInt(asUint24(Number(tick))) << BigInt(24 * i);
    }

    const combinedTick = (encodedTicks << 32n) + BigInt(expiry);
    const combinedDeadline = (BigInt(deadline) << 224n) + combinedTick;
    return pad32(combinedDeadline);
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

const pad32 = (value: bigint | string): Hex => {
    const hex =
        typeof value === 'string' ? (value.startsWith('0x') ? (value as Hex) : toHex(BigInt(value))) : toHex(value);
    return padHex(hex, { size: 32 });
};

function encodeParamForTradeAndPlace(tradeParam: TradeParam): readonly [Hex, Hex] {
    validateTiming(tradeParam);
    assertIntegerRange(tradeParam.size, 128, true, 'size');
    assertIntegerRange(tradeParam.amount, 128, true, 'amount');
    assertIntegerRange(tradeParam.limitTick, 24, true, 'limitTick');
    const usize = BigInt(asUint128(tradeParam.size));
    const uAmount = BigInt(asUint128(tradeParam.amount));
    const uTick = asUint24(tradeParam.limitTick);

    const combinedTick = (BigInt(uTick) << 32n) + BigInt(tradeParam.expiry);
    const combinedDeadline = (BigInt(tradeParam.deadline) << 56n) + combinedTick;
    const combinedSize = (usize << 128n) + uAmount;

    const page0 = pad32(combinedDeadline);
    const page1 = pad32(combinedSize);

    return [page0, page1] as const;
}

function encodeParamForDepositAndWithdraw(token: string, quantity: bigint): Hex {
    validateAddress(token);
    assertIntegerRange(quantity, 96, false, 'quantity');
    const result = (BigInt(quantity) << 160n) + BigInt(token);
    return pad32(result);
}

function assertIntegerRange(value: number | bigint, bits: number, signed: boolean, field: string): void {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
        throw Errors.encoding(`${field} must be a safe integer`);
    }
    const integer = BigInt(value);
    const bound = 1n << BigInt(signed ? bits - 1 : bits);
    if (integer < (signed ? -bound : 0n) || integer >= bound) {
        throw Errors.encoding(`${field} is outside ${signed ? 'int' : 'uint'}${bits} range`);
    }
}

function validateTiming(param: { expiry: number; deadline: number }): void {
    assertIntegerRange(param.expiry, 32, false, 'expiry');
    assertIntegerRange(param.deadline, 32, false, 'deadline');
}

function validateAddress(address: string): void {
    if (!isAddress(address, { strict: false })) throw Errors.encoding('Invalid packed address');
}
