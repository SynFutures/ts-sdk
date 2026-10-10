import { Address, padHex, toHex } from 'viem';
import { EMPTY_TICK, MAX_INT_24, ONE } from '../constants';
import { asInt24, asInt128 } from '../math';
import {
    Errors,
    MAX_CANCEL_ORDER_COUNT,
    type AddParam,
    type BatchPlaceParam,
    type FillParam,
    type PlaceParam,
    type RemoveParam,
    type TradeParam,
} from '../types';

// ============================================================================
// Exported Functions
// ============================================================================

export function decodeTradeParam(args: readonly string[]): TradeParam {
    return decodeParamForTradeAndPlace(args);
}

export function decodeDepositParam(arg: string): { token: string; quantity: bigint } {
    return decodeParamForDepositAndWithdraw(arg);
}

export function decodeWithdrawParam(arg: string): { token: string; quantity: bigint } {
    return decodeParamForDepositAndWithdraw(arg);
}

export function decodeParamForDepositAndWithdraw(arg: string): { token: string; quantity: bigint } {
    let offset = 0;
    const value = bytes32ToBigInt(arg);
    const token = pickAddress(value, offset, (offset += ADDRESS_LENGTH));
    const quantity = pickBigInt(value, offset, offset + QUANTITY_LENGTH);
    return { quantity, token };
}

export function decodeAddParam(args: readonly string[]): AddParam {
    if (args.length !== 2) {
        throw Errors.encoding('invalid args length for add', { args });
    }
    const [arg1, arg2] = args;

    let offset = 0;
    const value1 = bytes32ToBigInt(arg1);
    const expiry = pickNumber(value1, offset, (offset += EXPIRY_LENGTH));
    const limitTicks = Number(pickBigInt(value1, offset, (offset += LIMIT_TICKS_LENGTH)));
    const deadline = pickNumber(value1, offset, offset + DEADLINE_LENGTH);

    offset = 0;
    const value2 = bytes32ToBigInt(arg2);
    const amount = pickBigInt(value2, offset, (offset += AMOUNT_LENGTH));
    const tickDeltaUpper = pickNumber(value2, offset, (offset += TICK_LENGTH));
    const tickDeltaLower = pickNumber(value2, offset, offset + TICK_LENGTH);

    return {
        limitTicks,
        amount,
        tickDeltaLower,
        tickDeltaUpper,
        expiry,
        deadline,
    };
}

export function decodeRemoveParam(args: readonly string[]): RemoveParam {
    if (args.length !== 2) {
        throw Errors.encoding('invalid args length for remove', { args });
    }
    const [arg1, arg2] = args;

    let offset = 0;
    const value1 = bytes32ToBigInt(arg1);
    const expiry = pickNumber(value1, offset, (offset += EXPIRY_LENGTH));
    const limitTicks = Number(pickBigInt(value1, offset, (offset += LIMIT_TICKS_LENGTH)));
    const deadline = pickNumber(value1, offset, offset + DEADLINE_LENGTH);

    offset = 0;
    const value2 = bytes32ToBigInt(arg2);
    const target = pickAddress(value2, offset, (offset += ADDRESS_LENGTH));
    const tickLower = asInt24(pickNumber(value2, offset, (offset += TICK_LENGTH)));
    const tickUpper = asInt24(pickNumber(value2, offset, offset + TICK_LENGTH));

    return { tickUpper, tickLower, target: target as Address, expiry, limitTicks, deadline };
}

export function decodePlaceParam(args: readonly string[]): PlaceParam {
    const result = decodeParamForTradeAndPlace(args);
    return {
        expiry: result.expiry,
        size: result.size,
        amount: result.amount,
        tick: result.limitTick,
        deadline: result.deadline,
    };
}

export function decodeBatchPlaceParam(args: readonly string[]): BatchPlaceParam {
    if (args.length !== 3) {
        throw Errors.encoding('invalid args length for place', { args });
    }
    const [arg1, arg2, arg3] = args;

    const ticks: number[] = [];
    const ratios: number[] = [];

    let offset = 0;
    const value1 = bytes32ToBigInt(arg1);
    const expiry = pickNumber(value1, offset, (offset += EXPIRY_LENGTH));
    const deadline = pickNumber(value1, offset, (offset += DEADLINE_LENGTH));
    for (let i = 0; i < 3; i++) {
        const ratio = pickNumber(value1, offset, (offset += RATIO_LENGTH));
        const tick = asInt24(pickNumber(value1, offset, (offset += TICK_LENGTH)));
        if (BigInt(tick) === EMPTY_TICK) continue;
        ticks.push(tick);
        ratios.push(ratio);
    }

    offset = 0;
    const value2 = bytes32ToBigInt(arg2);
    for (let i = 0; i < 6; i++) {
        const ratio = pickNumber(value2, offset, (offset += RATIO_LENGTH));
        const tick = asInt24(pickNumber(value2, offset, (offset += TICK_LENGTH)));
        if (BigInt(tick) === EMPTY_TICK) continue;
        ticks.push(tick);
        ratios.push(ratio);
    }

    offset = 0;
    const value3 = bytes32ToBigInt(arg3);
    const leverage = asInt128(pickBigInt(value3, offset, (offset += LEVERAGE_LENGTH)));
    const size = asInt128(pickBigInt(value3, offset, offset + SIZE_LENGTH));

    return { expiry, ticks, ratios, size, leverage, deadline };
}

export function decodeFillParam(arg: string): FillParam {
    let offset = 0;
    const value = bytes32ToBigInt(arg);
    const expiry = pickNumber(value, offset, (offset += EXPIRY_LENGTH));
    const target = pickAddress(value, offset, (offset += ADDRESS_LENGTH));
    const tick = asInt24(pickNumber(value, offset, (offset += TICK_LENGTH)));
    const nonce = pickNumber(value, offset, offset + NONCE_LENGTH);
    return { nonce, tick, target: target as Address, expiry };
}

export function decodeCancelParam(arg: string): {
    expiry: number;
    ticks: number[];
    deadline: number;
} {
    let offset = 0;
    const value = bytes32ToBigInt(arg);
    const expiry = pickNumber(value, offset, (offset += EXPIRY_LENGTH));
    const ticks: number[] = [];
    const maxInt24 = Number(MAX_INT_24);
    for (let i = 0; i < MAX_CANCEL_ORDER_COUNT; i++) {
        const tick = asInt24(pickNumber(value, offset, (offset += TICK_LENGTH)));
        if (tick === maxInt24) continue;
        ticks.push(tick);
    }
    const deadline = pickNumber(value, offset, offset + DEADLINE_LENGTH);
    return { ticks, expiry, deadline };
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

const NONCE_LENGTH = 24;
const TICK_LENGTH = 24;
const LIMIT_TICKS_LENGTH = TICK_LENGTH * 2;
const EXPIRY_LENGTH = 32;
const SIZE_LENGTH = 128;
const AMOUNT_LENGTH = 128;
const QUANTITY_LENGTH = 96;
const ADDRESS_LENGTH = 160;
const DEADLINE_LENGTH = 32;
const RATIO_LENGTH = 16;
const LEVERAGE_LENGTH = 128;

const mask = (bits: number) => (ONE << BigInt(bits)) - ONE;

function bytes32ToBigInt(str: string): bigint {
    const value = str.startsWith('0x') ? str : '0x' + str;
    if (value.length !== 66) {
        throw Errors.encoding('invalid bytes32 string', { str });
    }
    return BigInt(value);
}

function pickBigInt(value: bigint, from: number, to: number): bigint {
    return (value >> BigInt(from)) & mask(to - from);
}

function pickNumber(value: bigint, from: number, to: number): number {
    return Number(pickBigInt(value, from, to));
}

function pickAddress(value: bigint, from: number, to: number): string {
    return padHex(toHex(pickBigInt(value, from, to)), { size: 20 });
}

function decodeParamForTradeAndPlace(args: readonly string[]): TradeParam {
    if (args.length !== 2) {
        throw Errors.encoding('invalid args length for trade and place', { args });
    }
    const [arg1, arg2] = args;

    let offset = 0;
    const value1 = bytes32ToBigInt(arg1);
    const expiry = pickNumber(value1, offset, (offset += EXPIRY_LENGTH));
    const limitTick = asInt24(pickNumber(value1, offset, (offset += TICK_LENGTH)));
    const deadline = pickNumber(value1, offset, offset + DEADLINE_LENGTH);

    offset = 0;
    const value2 = bytes32ToBigInt(arg2);
    const amount = asInt128(pickBigInt(value2, offset, (offset += AMOUNT_LENGTH)));
    const size = asInt128(pickBigInt(value2, offset, offset + SIZE_LENGTH));

    return { expiry, size, amount, limitTick, deadline };
}
