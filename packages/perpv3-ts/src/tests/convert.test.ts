import * as convert from '../utils/convert';
import { normalizeBigIntFields } from '../utils/convert';

describe('normalizeBigIntFields', () => {
    it('exports the normalized API name without the legacy alias', () => {
        expect(convert).toHaveProperty('normalizeBigIntFields');
        expect(convert).not.toHaveProperty('bigIntObjectCheckByKeys');
    });

    it('converts matching keys recursively without mutating the original value', () => {
        const input = {
            amount: '12',
            nested: {
                amount: 3,
                keep: 'untouched',
            },
            items: [
                {
                    amount: 4n,
                },
            ],
        };

        const converted = normalizeBigIntFields(input, ['amount']);

        expect(converted).toEqual({
            amount: 12n,
            nested: {
                amount: 3n,
                keep: 'untouched',
            },
            items: [
                {
                    amount: 4n,
                },
            ],
        });
        expect(input.nested.amount).toBe(3);
    });

    it('throws on malformed non-empty bigint values instead of silently preserving them', () => {
        expect(() => normalizeBigIntFields({ amount: 'not-a-number' }, ['amount'])).toThrow(
            'Invalid bigint value for key "amount"'
        );
    });

    it('throws on empty bigint values by default', () => {
        expect(() => normalizeBigIntFields({ amount: '' }, ['amount'])).toThrow(
            'Invalid bigint value for key "amount"'
        );
        expect(() => normalizeBigIntFields({ amount: null }, ['amount'])).toThrow(
            'Invalid bigint value for key "amount"'
        );
        expect(() => normalizeBigIntFields({ amount: undefined }, ['amount'])).toThrow(
            'Invalid bigint value for key "amount"'
        );
    });

    it('rejects empty bigint values even when a legacy mode option is passed by old callers', () => {
        const callWithOldOptions = normalizeBigIntFields as (
            value: unknown,
            keys: readonly string[],
            options?: unknown
        ) => unknown;

        expect(() => callWithOldOptions({ amount: '' }, ['amount'], { mode: 'legacy' })).toThrow(
            'Invalid bigint value for key "amount"'
        );
    });
});
