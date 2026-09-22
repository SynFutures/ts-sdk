import { asUint48 } from '../../math';
import {
    encodeTradeParam,
    encodeAddParam,
    encodeFillParam,
    encodeDepositParam,
    encodeCancelParam,
    encodeBatchPlaceParam,
} from '../../utils/encode';
import { decodeTradeParam, decodeAddParam, decodeFillParam, decodeDepositParam } from '../../utils/decode';

const trade = { expiry: 2 ** 32 - 1, deadline: 2 ** 32 - 1, limitTick: -100, size: 1n, amount: 0n };
const address = '0x0000000000000000000000000000000000000011' as const;

describe('packed integer boundaries', () => {
    test('converts signed 48-bit values without 32-bit shifts', () => {
        expect(asUint48(-1)).toBe(2 ** 48 - 1);
        expect(asUint48(-(2 ** 47))).toBe(2 ** 47);
    });
    test.each([-(1n << 127n), (1n << 127n) - 1n])('round trips int128 boundary %s', (value) => {
        const input = { ...trade, size: value, amount: value };
        expect(decodeTradeParam([...encodeTradeParam(input)])).toEqual(input);
    });
    test.each(['size', 'amount'] as const)('rejects %s overflow without corrupting adjacent fields', (field) => {
        for (const value of [1n << 127n, 1n << 128n, -(1n << 127n) - 1n]) {
            expect(() => encodeTradeParam({ ...trade, [field]: value })).toThrow(`${field} is outside int128 range`);
        }
    });
    test.each(['expiry', 'deadline'] as const)('rejects invalid %s', (field) => {
        for (const value of [-1, 2 ** 32, NaN, Infinity, 1.5]) {
            expect(() => encodeTradeParam({ ...trade, [field]: value })).toThrow(field);
        }
    });
    test.each([-(2 ** 23) - 1, 2 ** 23, 0.5])('rejects invalid tick %s', (limitTick) => {
        expect(() => encodeTradeParam({ ...trade, limitTick })).toThrow('limitTick');
    });
    test('round trips the full add field widths', () => {
        const input = {
            expiry: 1,
            deadline: 1,
            limitTicks: 2 ** 48 - 1,
            amount: (1n << 128n) - 1n,
            tickDeltaLower: 2 ** 24 - 1,
            tickDeltaUpper: 2 ** 24 - 1,
        };
        expect(decodeAddParam([...encodeAddParam(input)])).toEqual(input);
        expect(() => encodeAddParam({ ...input, amount: 1n << 128n })).toThrow('amount');
        expect(() => encodeAddParam({ ...input, limitTicks: 2 ** 48 })).toThrow('limitTicks');
    });
    test('keeps fill nonce, address and signed tick independent', () => {
        const input = { expiry: 1, target: address, tick: -(2 ** 23), nonce: 2 ** 24 - 1 };
        expect(decodeFillParam(encodeFillParam(input))).toEqual(input);
        expect(() => encodeFillParam({ ...input, nonce: 2 ** 24 })).toThrow('nonce');
    });
    test('enforces the uint96 deposit amount and address width', () => {
        const quantity = (1n << 96n) - 1n;
        expect(decodeDepositParam(encodeDepositParam(address, quantity))).toEqual({ token: address, quantity });
        expect(() => encodeDepositParam(address, 1n << 96n)).toThrow('quantity');
        expect(() => encodeDepositParam('0x11', 1n)).toThrow('address');
    });
    test('rejects invalid cancel ticks and negative batch ratios', () => {
        expect(() => encodeCancelParam({ expiry: 1, deadline: 1, ticks: [2 ** 24] })).toThrow('tick');
        expect(() =>
            encodeBatchPlaceParam({
                expiry: 1,
                deadline: 1,
                size: 1n,
                leverage: 1n,
                ticks: [1, 2],
                ratios: [-1, 10001],
            })
        ).toThrow('ratio');
    });
});
