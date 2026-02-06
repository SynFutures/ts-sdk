import { WAD, ZERO } from '../constants';
import { alphaWadToTickDelta, ratioToWad, wadToTick } from '../math';
import { estimateAPY } from '../frontend';
import { NumericConverter } from '../utils';
import { Condition, QuoteType, Side, Status, type Amm } from '../types';

describe('Public helpers', () => {
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
        const amm = { liquidity: ZERO } as unknown as Amm;
        expect(estimateAPY(amm, 0n, 0, 0n, 1000, 10)).toBe(0);
    });
});

