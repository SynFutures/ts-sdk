import {
    shiftLeft,
    shiftRight,
    abs,
    wdivUp,
    ratioToWad,
    sqrt,
    sqrtX96ToWad,
    wadToSqrtX96,
    wdiv,
    wdivDown,
    wmul,
    wmulDown,
    wmulInt,
    wmulUp,
    tickToSqrtX96,
    tickToWad,
    sqrtX96ToTick,
} from '../math';
import { RATIO_DECIMALS, WAD } from '../constants';
import { Range } from '../types';
import { Condition, InstrumentSetting, QuoteType, Range, Setting, Side, UserSetting } from '../types';
import { calcOrderLeverageByMargin, getNextSqrtPriceFromInput } from './utils/mathTestUtils';
import { zeroAddress } from 'viem';

const DEFAULT_TEST_SPACING = {
    pearlSpacing: 1,
    orderSpacing: 1,
    rangeSpacing: 50,
};

// Helper to create mock InstrumentSetting for tests
const createMockInstrumentSetting = (imr: number = 1000): InstrumentSetting => {
    const mockSetting: Setting = {
        symbol: 'ETH/USD',
        config: zeroAddress,
        gate: zeroAddress,
        market: zeroAddress,
        quote: zeroAddress,
        decimals: 18,
        initialMarginRatio: imr,
        maintenanceMarginRatio: imr / 2,
        placePaused: false,
        fundingHour: 0,
        disableOrderRebate: false,
        param: {
            minMarginAmount: BigInt('1000000000000000000'), // 1 ETH
            tradingFeeRatio: 30,
            protocolFeeRatio: 10,
            qtype: QuoteType.STABLE,
            tip: BigInt('0'),
        },
    };
    return new InstrumentSetting(
        mockSetting,
        Condition.NORMAL,
        DEFAULT_TEST_SPACING.pearlSpacing,
        DEFAULT_TEST_SPACING.orderSpacing,
        DEFAULT_TEST_SPACING.rangeSpacing
    );
};

// Test-only helper functions (moved from calculation.ts)
function relativeDiffRatioWadAbs(wadA: bigint, wadB: bigint): bigint {
    return wdivUp(abs(wadA - wadB), wadA < wadB ? wadA : wadB);
}

function getMaxLeverage(imr: number): number {
    return 1 / (imr / 10 ** RATIO_DECIMALS);
}

describe('math.ts', () => {
    describe('shiftLeft', () => {
        it('should perform left shift correctly for basic cases', () => {
            expect(shiftLeft(1, 0)).toBe(1);
            expect(shiftLeft(1, 1)).toBe(2);
            expect(shiftLeft(1, 2)).toBe(4);
            expect(shiftLeft(1, 3)).toBe(8);
            expect(shiftLeft(1, 4)).toBe(16);
        });

        it('should perform left shift correctly for larger numbers', () => {
            expect(shiftLeft(5, 2)).toBe(20);
            expect(shiftLeft(10, 3)).toBe(80);
            expect(shiftLeft(100, 4)).toBe(1600);
        });

        it('should handle zero correctly', () => {
            expect(shiftLeft(0, 5)).toBe(0);
        });

        it('should handle negative numbers correctly', () => {
            expect(shiftLeft(-1, 2)).toBe(-4);
            expect(shiftLeft(-5, 3)).toBe(-40);
        });

        it('should handle fractional numbers correctly', () => {
            expect(shiftLeft(1.5, 2)).toBe(6);
            expect(shiftLeft(2.5, 3)).toBe(20);
        });

        it('should throw error for negative shift amount', () => {
            expect(() => shiftLeft(1, -1)).toThrow(
                "Shift amount 'n' must be a non-negative number for shift operations."
            );
            expect(() => shiftLeft(5, -5)).toThrow(
                "Shift amount 'n' must be a non-negative number for shift operations."
            );
        });

        it('should throw error for shift amount exceeding 53', () => {
            expect(() => shiftLeft(1, 54)).toThrow(
                "Shift amount 'n' must be less than 53 for shift operations to avoid precision loss."
            );
            expect(() => shiftLeft(1, 100)).toThrow(
                "Shift amount 'n' must be less than 53 for shift operations to avoid precision loss."
            );
        });

        it('should throw error for shift amount that would cause overflow', () => {
            expect(() => shiftLeft(1, 53)).toThrow("Shift amount 'n' is too large for shift operations.");
        });

        it('should handle maximum safe shift amount', () => {
            // 2^52 is the largest power of 2 that's still safe
            const result = shiftLeft(1, 52);
            expect(result).toBe(Math.pow(2, 52));
        });
    });

    describe('shiftRight', () => {
        it('should perform right shift correctly for basic cases', () => {
            expect(shiftRight(1, 0)).toBe(1);
            expect(shiftRight(2, 1)).toBe(1);
            expect(shiftRight(4, 2)).toBe(1);
            expect(shiftRight(8, 3)).toBe(1);
            expect(shiftRight(16, 4)).toBe(1);
        });

        it('should perform right shift correctly for larger numbers', () => {
            expect(shiftRight(20, 2)).toBe(5);
            expect(shiftRight(80, 3)).toBe(10);
            expect(shiftRight(1600, 4)).toBe(100);
        });

        it('should handle zero correctly', () => {
            expect(shiftRight(0, 5)).toBe(0);
        });

        it('should handle negative numbers correctly', () => {
            expect(shiftRight(-4, 2)).toBe(-1);
            expect(shiftRight(-40, 3)).toBe(-5);
        });

        it('should handle fractional numbers correctly', () => {
            expect(shiftRight(6, 2)).toBe(1);
            expect(shiftRight(20, 3)).toBe(2);
        });

        it('should floor the result for non-integer division', () => {
            expect(shiftRight(5, 1)).toBe(2); // 5 / 2 = 2.5, floored to 2
            expect(shiftRight(7, 2)).toBe(1); // 7 / 4 = 1.75, floored to 1
            expect(shiftRight(9, 3)).toBe(1); // 9 / 8 = 1.125, floored to 1
        });

        it('should throw error for negative shift amount', () => {
            expect(() => shiftRight(1, -1)).toThrow(
                "Shift amount 'n' must be a non-negative number for shift operations."
            );
            expect(() => shiftRight(5, -5)).toThrow(
                "Shift amount 'n' must be a non-negative number for shift operations."
            );
        });

        it('should throw error for shift amount exceeding 53', () => {
            expect(() => shiftRight(1, 54)).toThrow(
                "Shift amount 'n' must be less than 53 for shift operations to avoid precision loss."
            );
            expect(() => shiftRight(1, 100)).toThrow(
                "Shift amount 'n' must be less than 53 for shift operations to avoid precision loss."
            );
        });

        it('should throw error for shift amount that would cause overflow', () => {
            expect(() => shiftRight(1, 53)).toThrow("Shift amount 'n' is too large for shift operations.");
        });

        it('should handle maximum safe shift amount', () => {
            // Using a large number to test the maximum safe shift
            const largeNumber = Math.pow(2, 52);
            const result = shiftRight(largeNumber, 52);
            expect(result).toBe(1);
        });
    });

    describe('Combined Operations', () => {
        it('should correctly reverse shiftLeft with shiftRight', () => {
            const original = 42;
            const shiftAmount = 3;

            const shiftedLeft = shiftLeft(original, shiftAmount);
            const shiftedBack = shiftRight(shiftedLeft, shiftAmount);

            expect(shiftedBack).toBe(original);
        });

        it('should correctly reverse shiftRight with shiftLeft for even numbers', () => {
            const original = 48;
            const shiftAmount = 2;

            const shiftedRight = shiftRight(original, shiftAmount);
            const shiftedBack = shiftLeft(shiftedRight, shiftAmount);

            expect(shiftedBack).toBe(original);
        });

        it('should handle precision correctly with combined operations', () => {
            // Test with a number that has binary representation
            const original = 13; // Binary: 1101

            // Shift left by 2: 110100 (52)
            const shiftedLeft = shiftLeft(original, 2);
            expect(shiftedLeft).toBe(52);

            // Shift right by 1: 11010 (26)
            const shiftedRight = shiftRight(shiftedLeft, 1);
            expect(shiftedRight).toBe(26);
        });
    });

    describe('Edge Cases', () => {
        it('should handle very small numbers', () => {
            expect(shiftLeft(0.1, 1)).toBe(0.2);
            expect(shiftRight(0.1, 1)).toBe(0);
        });

        it('should handle very large numbers within safe range', () => {
            const largeNumber = Number.MAX_SAFE_INTEGER / 2;
            const shifted = shiftLeft(largeNumber, 1);
            expect(shifted).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
        });

        it('should handle shift amount of 0 correctly', () => {
            const original = 123;
            expect(shiftLeft(original, 0)).toBe(original);
            expect(shiftRight(original, 0)).toBe(original);
        });
    });

    describe('WAD Math Operations - Specific Test Cases', () => {
        test('wmul operations with specific values', () => {
            const x = 1_234_567_890_123_456_789n;
            const y = 987_654_321_098_765_432n;

            expect(wmul(x, y)).toBe(1219326311370217952n);
            expect(wmulUp(x, y)).toBe(1219326311370217953n);
            expect(wmulDown(x, y)).toBe(1219326311370217952n);
        });

        test('wdiv operations with specific values', () => {
            const x = 1_234_567_890_123_456_789n;
            const y = 987_654_321_098_765_432n;

            expect(wdiv(x, y)).toBe(1249999988609375000n);
            expect(wdivUp(x, y)).toBe(1249999988609375001n);
            expect(wdivDown(x, y)).toBe(1249999988609375000n);
        });

        test('wmulInt with negative values', () => {
            const a = -5_000_000_000_000_000_000n;
            const b = 3_333_333_333_333_333_333n;
            expect(wmulInt(a, b)).toBe(-16666666666666666665n);
        });

        test('sqrt function with specific values', () => {
            expect(sqrt(0n)).toBe(0n);
            expect(sqrt(1n)).toBe(1n);
            expect(sqrt(25n)).toBe(5n);
            expect(sqrt(100n)).toBe(10n);
            expect(sqrt(144n)).toBe(12n);
        });
    });

    describe('TickMath Operations - Specific Test Cases', () => {
        test('getSqrtRatioAtTick with specific tick', () => {
            const tick = -12345;
            const sqrtRatio = tickToSqrtX96(tick);
            expect(sqrtRatio).toBe(42739035517269358503607398648n);
        });

        test('getWadAtTick with specific tick', () => {
            const tick = -12345;
            const priceWad = tickToWad(tick);
            expect(priceWad).toBe(290998176220237461n);
        });

        test('getTickAtSqrtRatio round-trip', () => {
            const tick = -12345;
            const sqrtRatio = tickToSqrtX96(tick);
            const tickFromSqrt = sqrtX96ToTick(sqrtRatio);
            expect(tickFromSqrt).toBe(tick);
        });

        test('getLimitTickForTrade operations', () => {
            const userSetting = new UserSetting(600, 50, 3n * WAD);
            const tradePrice = tickToWad(250);
            const longLimit = userSetting.getTradeLimitTick(tradePrice, Side.LONG);
            const shortLimit = userSetting.getTradeLimitTick(tradePrice, Side.SHORT);

            expect(longLimit).toBe(299);
            expect(shortLimit).toBe(200);
        });

        test('encodeLimitTicks', () => {
            const sqrtLower = tickToSqrtX96(-500);
            const sqrtUpper = tickToSqrtX96(500);
            // Inline encodeLimitTicks logic for testing
            const INT24_MIN = -(1 << 23);
            const INT24_MAX = (1 << 23) - 1;
            const ZERO_TICK = 0n;
            const normalize = (tick: number): bigint => {
                const value = BigInt(tick);
                return value >= 0 ? value : (1n << 24n) + value;
            };
            const lowerTick = sqrtLower === ZERO_TICK ? INT24_MIN : sqrtX96ToTick(sqrtLower) + 1;
            const upperTick = sqrtUpper === ZERO_TICK ? INT24_MAX : sqrtX96ToTick(sqrtUpper);
            const encoded = (normalize(lowerTick) << 24n) + normalize(upperTick);
            expect(encoded).toBe(281466604880372n);
        });
    });

    describe('SqrtPriceMath Operations - Specific Test Cases', () => {
        test('getDeltaBaseAutoRoundUp', () => {
            const sqrtA = tickToSqrtX96(-200);
            const sqrtB = tickToSqrtX96(200);
            const liquidity = 9_876_543_210_000n;

            // Create a temporary Range instance to use instance methods
            const tempRange = new Range(0n, 0n, 0n, sqrtA, 0, 0);
            const deltaBase = tempRange.getDeltaBaseAutoRoundUp(sqrtA, sqrtB, liquidity);
            expect(deltaBase).toBe(197524280019n);
        });

        test('getDeltaQuoteAutoRoundUp', () => {
            const sqrtA = tickToSqrtX96(-200);
            const sqrtB = tickToSqrtX96(200);
            const liquidity = 9_876_543_210_000n;

            // Create a temporary Range instance to use instance methods
            const tempRange = new Range(0n, 0n, 0n, sqrtA, 0, 0);
            const deltaQuote = tempRange.getDeltaQuoteAutoRoundUp(sqrtA, sqrtB, liquidity);
            expect(deltaQuote).toBe(197524280019n);
        });

        test('getNextSqrtPriceFromInput', () => {
            const sqrtP = tickToSqrtX96(150);
            const liquidity = 500_000_000_000n;
            const amount = 25_000_000_000_000n;

            const nextSqrtPrice = getNextSqrtPriceFromInput(sqrtP, liquidity, amount, true);
            expect(nextSqrtPrice).toBe(1553721004984048833025106378n);
        });
    });

    describe('Boost Calculations - Specific Test Cases', () => {
        test('calcBoost with specific values', () => {
            const alpha = 1.8;
            const imr = 1_000;
            const result = Range.calcBoost(alpha, imr);
            expect(result).toBeCloseTo(12.303577359188738, 12);
        });

        test('calcAsymmetricBoost with specific values', () => {
            const alphaLower = 1.6;
            const alphaUpper = 2.4;
            const imr = 1_000;
            const result = Range.calcAsymmetricBoost(alphaLower, alphaUpper, imr);
            expect(result).toBeCloseTo(5.172048327441648, 12);
        });
    });

    describe('Utility Functions - Specific Test Cases', () => {
        test('getMaxLeverage with specific IMR values', () => {
            expect(getMaxLeverage(1_000)).toBe(10);
            expect(getMaxLeverage(500)).toBe(20);
            expect(getMaxLeverage(300)).toBeCloseTo(33.333, 2);
            expect(getMaxLeverage(100)).toBe(100);
        });

        test('calcOrderLeverageByMargin with specific values', () => {
            const tick = 250;
            const baseQuantity = 4n * WAD;
            const margin = 6n * WAD;

            const result = calcOrderLeverageByMargin(tick, baseQuantity, margin);
            expect(result).toBe(683542559311177083n);
        });

        test('relativeDiffRatioWadAbs with specific values', () => {
            const wadA = (9n * WAD) / 10n;
            const wadB = (11n * WAD) / 10n;
            const result = relativeDiffRatioWadAbs(wadA, wadB);
            expect(result).toBe(222222222222222223n);
        });

        test('ratioToWad conversion with specific values', () => {
            expect(ratioToWad(0n)).toBe(0n);
            expect(ratioToWad(100n)).toBe(10000000000000000n);
            expect(ratioToWad(1_000n)).toBe(100000000000000000n);
            expect(ratioToWad(12_345n)).toBe(1234500000000000000n);
        });

        test('alignLimitOrderTargetPrice with specific values', () => {
            const price = tickToWad(345);
            const instrumentSetting = createMockInstrumentSetting();
            const result = instrumentSetting.alignLimitOrderTargetPrice(price);
            expect(result.alignedTick).toBe(345);
            expect(result.alignedPrice).toBe(1035100242945683024n);
        });

        test('wad/sqrt conversions with specific values', () => {
            const tick = 120;
            const sqrtRatio = tickToSqrtX96(tick);
            const priceWad = tickToWad(tick);

            const convertedWad = sqrtX96ToWad(sqrtRatio);
            const convertedSqrt = wadToSqrtX96(priceWad);

            expect(convertedWad).toBe(priceWad);
            expect(convertedSqrt).toBe(79704936542881920866162254446n);
        });
    });
});
