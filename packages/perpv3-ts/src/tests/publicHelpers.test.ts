import { WAD, ZERO } from '../constants';
import { alphaWadToTickDelta, ratioToWad, tickToSqrtX96, wadToTick } from '../math';
import { estimateAPY } from '../frontend';
import { NumericConverter } from '../utils';
import { Condition, QuoteType, Side, Status, type Amm } from '../types';

describe('Public helpers', () => {
    const makeAmm = (overrides: Partial<Amm>): Amm => ({
        expiry: 0,
        timestamp: 0,
        status: Status.TRADING,
        tick: 0,
        sqrtPX96: tickToSqrtX96(0),
        liquidity: 0n,
        totalLiquidity: 0n,
        totalShort: 0n,
        openInterests: 0n,
        totalLong: 0n,
        involvedFund: 0n,
        feeIndex: 0n,
        protocolFee: 0n,
        longSocialLossIndex: 0n,
        shortSocialLossIndex: 0n,
        longFundingIndex: 0n,
        shortFundingIndex: 0n,
        insuranceFund: 0n,
        settlementPrice: 0n,
        ...overrides,
    });

    test('enums keep stable numeric values', () => {
        expect(Side.FLAT).toBe(0);
        expect(Side.SHORT).toBe(1);
        expect(Side.LONG).toBe(2);

        expect(Status.DORMANT).toBe(0);
        expect(Status.TRADING).toBe(1);
        expect(Status.SETTLING).toBe(2);
        expect(Status.SETTLED).toBe(3);

        expect(Condition.NORMAL).toBe(0);
        expect(Condition.FROZEN).toBe(1);
        expect(Condition.RESOLVED).toBe(2);

        expect(QuoteType.INVALID).toBe(0);
        expect(QuoteType.STABLE).toBe(1);
        expect(QuoteType.NONSTABLE).toBe(2);
    });

    test('alphaWadToTickDelta matches wadToTick + 1', () => {
        expect(alphaWadToTickDelta(WAD)).toBe(wadToTick(WAD) + 1);
    });

    test('NumericConverter converts quote amounts and ratios', () => {
        expect(NumericConverter.scaleQuoteAmount(1n, 18)).toBe(1n);
        expect(NumericConverter.scaleQuoteAmount(1n, 6)).toBe(10n ** 12n);

        expect(NumericConverter.toContractQuoteAmount(10n ** 12n, 6)).toBe(1n);
        expect(NumericConverter.toContractRatio(ratioToWad(123))).toBe(123n);
    });

    test('estimateAPY returns 0 for empty AMM liquidity', () => {
        const amm = makeAmm({ liquidity: ZERO, tick: 0, sqrtPX96: tickToSqrtX96(0) });
        expect(estimateAPY(amm, 0n, 10, 1n, 1000, 10)).toBe(0);
    });

    test('estimateAPY returns 0 for zero minRangeValue', () => {
        const amm = makeAmm({ liquidity: 1n, tick: 0, sqrtPX96: tickToSqrtX96(0) });
        expect(estimateAPY(amm, 0n, 10, 0n, 1000, 10)).toBe(0);
    });

    test('estimateAPY returns 0 for tick boundary edge cases', () => {
        // When upper/lower tick aligns to amm.tick and sqrtPX96 is exactly on that tick boundary,
        // Range.calcEntryDelta would hit division-by-zero without our guard.
        const tick = 100;
        const amm = makeAmm({ liquidity: 1n, tick, sqrtPX96: tickToSqrtX96(tick) });
        expect(estimateAPY(amm, 1n, 10, 1n, 1000, 50)).toBe(0);
    });

    test('estimateAPY returns a positive APY for valid inputs', () => {
        const tick = 100;
        const amm = makeAmm({
            liquidity: 1_000n * WAD,
            tick,
            sqrtPX96: tickToSqrtX96(tick),
        });

        const apy = estimateAPY(amm, 1n * WAD, 20, 1n * WAD, 1000, 10);
        expect(apy).toBeGreaterThan(0);
    });
});
