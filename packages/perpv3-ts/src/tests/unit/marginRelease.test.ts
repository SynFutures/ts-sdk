import { abs, tickToWad, wdiv, wmul } from '../../math';
import {
    PERP_EXPIRY,
    Position,
    QuotationWithSize,
    Status,
    type Amm,
    type Quotation,
    type TradeParam,
} from '../../types';
import { Q96, WAD, ZERO } from '../../constants';

describe('Position.marginForTargetLeverage', () => {
    const markPrice = tickToWad(0);

    const amm: Amm = {
        expiry: PERP_EXPIRY,
        timestamp: 0,
        status: Status.TRADING,
        tick: 0,
        sqrtPX96: Q96,
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
    };

    const buildQuotation = (signedSize: bigint): Quotation => ({
        benchmark: markPrice,
        sqrtFairPX96: Q96,
        tick: 0,
        mark: markPrice,
        entryNotional: wmul(markPrice, abs(signedSize)),
        fee: 0n,
        minAmount: 0n,
        sqrtPostFairPX96: Q96,
        postTick: 0,
    });

    test('keeps selected leverage when reducing position', () => {
        const preSize = 10n * WAD;
        const preValue = wmul(markPrice, abs(preSize));
        const preEquity = 5n * WAD; // 2x leverage at entry price = mark price
        const position = new Position(preEquity, preSize, preValue, 0n, 0n);

        const tradeSize = -4n * WAD;
        const tradeParam: TradeParam = {
            expiry: PERP_EXPIRY,
            size: tradeSize,
            amount: 0n,
            limitTick: 0,
            deadline: 0,
        };
        const quotation = buildQuotation(tradeSize);
        const quotationWithSize = new QuotationWithSize(tradeSize, quotation);

        const targetLeverage = 5n * WAD;
        const margin = position.marginForTargetLeverage(amm, tradeParam, quotationWithSize, targetLeverage);

        const postSize = preSize + tradeSize;
        const expectedPostEquity = wdiv(wmul(markPrice, abs(postSize)), targetLeverage);
        const expectedMargin = expectedPostEquity - preEquity;

        expect(margin).toBe(expectedMargin);
        expect(margin).toBeLessThan(ZERO);
    });

    test('does not return negative margin on full close (remaining margin is gathered by Gate)', () => {
        const preSize = 10n * WAD;
        const preValue = wmul(markPrice, abs(preSize));
        const preEquity = preValue / 5n;
        const position = new Position(preEquity, preSize, preValue, 0n, 0n);

        const tradeSize = -10n * WAD;
        const tradeParam: TradeParam = {
            expiry: PERP_EXPIRY,
            size: tradeSize,
            amount: 0n,
            limitTick: 0,
            deadline: 0,
        };
        const quotation = buildQuotation(tradeSize);
        const quotationWithSize = new QuotationWithSize(tradeSize, quotation);

        const margin = position.marginForTargetLeverage(amm, tradeParam, quotationWithSize, 3n * WAD);
        expect(margin).toBe(ZERO);
    });

    test('requires extra margin on full close when equity is insufficient', () => {
        const preSize = 10n * WAD;
        const preValue = wmul(markPrice, abs(preSize));
        const position = new Position(-1n * WAD, preSize, preValue, 0n, 0n);

        const tradeSize = -10n * WAD;
        const tradeParam: TradeParam = {
            expiry: PERP_EXPIRY,
            size: tradeSize,
            amount: 0n,
            limitTick: 0,
            deadline: 0,
        };
        const quotation = buildQuotation(tradeSize);
        const quotationWithSize = new QuotationWithSize(tradeSize, quotation);

        const margin = position.marginForTargetLeverage(amm, tradeParam, quotationWithSize, 3n * WAD);
        expect(margin).toBe(1n * WAD);
    });
});
