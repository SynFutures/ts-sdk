import { WAD } from '../../constants';
import { sqrt } from '../../math';
import { Range } from '../../types/range';

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
            // Fixed contract parity vector; the SDK has no next-price implementation.
            const sqrtQ = 1025574284609383582644711336373707553698163132913n;

            const tempRange = new Range(0n, 0n, 0n, 1n, 0, 0);
            const amount0Delta = tempRange.getDeltaBase(sqrtQ, sqrtP, liquidity);
            expect(amount0Delta).toBe(406n);
        });
    });
});
