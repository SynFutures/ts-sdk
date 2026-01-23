import { MAX_UINT_128, MAX_UINT_256, WAD } from '../constants';
import { sqrt } from '../math';
import { Range } from '../types/range';
import { getNextSqrtPriceFromDeltaBase } from './utils/mathTestUtils';

function expandTo18Decimals(value: number): bigint {
    return BigInt(value) * WAD;
}

function encodePriceSqrt(reserve1: bigint, reserve0: bigint): bigint {
    if (reserve0 === 0n) {
        throw new Error('reserve0 must be non-zero');
    }
    return sqrt((reserve1 << 192n) / reserve0);
}

describe('SqrtPriceMath (ported from v3-contracts Hardhat tests)', () => {
    describe('getNextSqrtPriceFromDeltaBase', () => {
        it('throws if price is zero', () => {
            expect(() => getNextSqrtPriceFromDeltaBase(0n, 1n, WAD / 10n, false)).toThrow();
        });

        it('throws if liquidity is zero', () => {
            expect(() => getNextSqrtPriceFromDeltaBase(1n, 0n, WAD / 10n, true)).toThrow();
        });

        it('throws if input amount causes underflow', () => {
            const price = (1n << 160n) - 1n;
            expect(() => getNextSqrtPriceFromDeltaBase(price, 1024n, 1024n, true)).toThrow();
        });

        it('any input amount cannot underflow the price', () => {
            const price = 1n;
            const liquidity = 1n;
            const amountIn = 1n << 255n;
            expect(getNextSqrtPriceFromDeltaBase(price, liquidity, amountIn, false)).toBe(1n);
        });

        it('returns input price if amount in is zero and isLong = true', () => {
            const price = encodePriceSqrt(1n, 1n);
            expect(getNextSqrtPriceFromDeltaBase(price, WAD / 10n, 0n, true)).toBe(price);
        });

        it('returns input price if amount in is zero and isLong = false', () => {
            const price = encodePriceSqrt(1n, 1n);
            expect(getNextSqrtPriceFromDeltaBase(price, WAD / 10n, 0n, false)).toBe(price);
        });

        it('returns the minimum price for max inputs', () => {
            const sqrtP = (1n << 160n) - 1n;
            const liquidity = MAX_UINT_128;
            const maxAmountNoOverflow = MAX_UINT_256 - ((liquidity << 96n) / sqrtP);
            expect(getNextSqrtPriceFromDeltaBase(sqrtP, liquidity, maxAmountNoOverflow, false)).toBe(1n);
        });

        it('input amount of 0.1 base', () => {
            const sqrtQ = getNextSqrtPriceFromDeltaBase(
                encodePriceSqrt(1n, 1n),
                expandTo18Decimals(1),
                expandTo18Decimals(1) / 10n,
                false
            );
            expect(sqrtQ).toBe(72025602285694852357767227579n);
        });

        it('amountIn > type(uint96).max', () => {
            const sqrtQ = getNextSqrtPriceFromDeltaBase(
                encodePriceSqrt(1n, 1n),
                expandTo18Decimals(10),
                1n << 100n,
                false
            );
            expect(sqrtQ).toBe(624999999995069620n);
        });

        it('can return 1 with enough amountIn', () => {
            expect(getNextSqrtPriceFromDeltaBase(encodePriceSqrt(1n, 1n), 1n, MAX_UINT_256 / 2n, false)).toBe(1n);
        });
    });

    describe('getDeltaBase', () => {
        const tempRange = new Range(0n, 0n, 0n, 1n, 0, 0);

        it('returns 0 if liquidity is 0', () => {
            const amount0 = tempRange.getDeltaBase(encodePriceSqrt(1n, 1n), encodePriceSqrt(2n, 1n), 0n);
            expect(amount0).toBe(0n);
        });

        it('returns 0 if prices are equal', () => {
            const sqrtP = encodePriceSqrt(1n, 1n);
            const amount0 = tempRange.getDeltaBase(sqrtP, sqrtP, expandTo18Decimals(1));
            expect(amount0).toBe(0n);
        });

        it('returns 0.1 amount0 for price of 1 to 1.21', () => {
            const amount0 = tempRange.getDeltaBase(
                encodePriceSqrt(1n, 1n),
                encodePriceSqrt(121n, 100n),
                expandTo18Decimals(1)
            );
            expect(amount0).toBe(90909090909090910n);
        });
    });

    describe('getDeltaQuote', () => {
        const tempRange = new Range(0n, 0n, 0n, 1n, 0, 0);

        it('returns 0 if liquidity is 0', () => {
            const amount1 = tempRange.getDeltaQuote(encodePriceSqrt(1n, 1n), encodePriceSqrt(2n, 1n), 0n, true);
            expect(amount1).toBe(0n);
        });

        it('returns 0 if prices are equal', () => {
            const sqrtP = encodePriceSqrt(1n, 1n);
            const amount1 = tempRange.getDeltaQuote(sqrtP, sqrtP, expandTo18Decimals(1), true);
            expect(amount1).toBe(0n);
        });

        it('returns 0.1 amount1 for price of 1 to 1.21', () => {
            const amount1 = tempRange.getDeltaQuote(
                encodePriceSqrt(1n, 1n),
                encodePriceSqrt(121n, 100n),
                expandTo18Decimals(1),
                true
            );
            expect(amount1).toBe(100000000000000000n);

            const amount1RoundedDown = tempRange.getDeltaQuote(
                encodePriceSqrt(1n, 1n),
                encodePriceSqrt(121n, 100n),
                expandTo18Decimals(1),
                false
            );
            expect(amount1RoundedDown).toBe(amount1 - 1n);
        });
    });

    describe('swap computation', () => {
        it('sqrtP * sqrtQ overflows (parity case)', () => {
            const sqrtP = BigInt('1025574284609383690408304870162715216695788925244');
            const liquidity = BigInt('50015962439936049619261659728067971248');
            const amountIn = 406n;

            const sqrtQ = getNextSqrtPriceFromDeltaBase(sqrtP, liquidity, amountIn, false);
            expect(sqrtQ).toBe(BigInt('1025574284609383582644711336373707553698163132913'));

            const tempRange = new Range(0n, 0n, 0n, 1n, 0, 0);
            const amount0Delta = tempRange.getDeltaBase(sqrtQ, sqrtP, liquidity);
            expect(amount0Delta).toBe(406n);
        });
    });
});
