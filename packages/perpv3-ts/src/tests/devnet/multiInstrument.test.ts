import { CURRENT_INSTRUMENT_ABI } from '../../index';
import {
    PERP_EXPIRY,
    QuotationWithSize,
    Side,
    TradeInput,
    UserSetting,
    WAD,
    encodeTradeParam,
    fetchOnchainContext,
    inquireByBaseSize,
} from '../../index';
import { createDevnetContext, createDevnetHelpers } from './devnet';

const ctx = createDevnetContext();

const defaultInstrument = ctx.manifest.defaults.instrument;
const defaultQuote = ctx.manifest.tokens.quotes[defaultInstrument.quoteSymbol];
if (!defaultQuote) {
    throw new Error(`Missing quote token info in manifest for ${defaultInstrument.quoteSymbol}`);
}
const QUOTE_TOKEN = defaultQuote.address;
const { waitForTx, transferQuote, approveQuote, depositQuote } = createDevnetHelpers(ctx, QUOTE_TOKEN);
const QUOTE_UNIT = 10n ** BigInt(defaultQuote.decimals);

function createUserSetting() {
    return new UserSetting(3600, 50, 4n * WAD);
}

function uniqueMarketTypes(instruments: typeof ctx.manifest.instruments): string[] {
    return Array.from(new Set(instruments.map((instrument) => instrument.marketType)));
}

describe('devnet multi-instrument fixtures', () => {
    it('fetchOnchainContext & inquireByBaseSize works for all instruments', async () => {
        for (const instrument of ctx.manifest.instruments) {
            const snapshot = await fetchOnchainContext(
                instrument.address,
                instrument.expiry,
                ctx.rpcConfig,
                ctx.accounts.trader.address
            );

            expect(snapshot.expiry).toBe(instrument.expiry);
            expect(snapshot.instrumentSymbol).toBe(instrument.symbol);
            expect(snapshot.amm.liquidity).toBeGreaterThan(0n);

            const quotation = await inquireByBaseSize(instrument.address, instrument.expiry, WAD / 20n, ctx.rpcConfig);
            expect(quotation.mark).toBeGreaterThan(0n);
        }
    });

    test.each(uniqueMarketTypes(ctx.manifest.instruments))('trade works for marketType %s', async (marketType) => {
        const instrument = ctx.manifest.instruments.find((item) => item.marketType === marketType);
        if (!instrument) throw new Error(`Missing instrument in manifest for marketType=${marketType}`);

        const traderAddress = ctx.accounts.trader.address;
        const transferAmount = 200_000n * QUOTE_UNIT;
        const depositAmount = 50_000n * QUOTE_UNIT;

        await transferQuote(traderAddress, transferAmount);
        await approveQuote(ctx.walletClients.trader, transferAmount);
        await depositQuote(ctx.walletClients.trader, depositAmount);

        const before = await fetchOnchainContext(instrument.address, instrument.expiry, ctx.rpcConfig, traderAddress);
        expect(before.portfolio.position.size).toBe(0n);

        const userSetting = createUserSetting();
        const minTradeValue = before.instrumentSetting.minTradeValue;

        let baseQuantity = WAD / 20n; // 0.05 base
        let quotationWithSize: QuotationWithSize | undefined;

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const signedSize = baseQuantity; // LONG
            const quotation = await inquireByBaseSize(instrument.address, instrument.expiry, signedSize, ctx.rpcConfig);
            const candidate = new QuotationWithSize(signedSize, quotation);
            if (candidate.tradeValue >= minTradeValue) {
                quotationWithSize = candidate;
                break;
            }
            baseQuantity *= 2n;
        }

        if (!quotationWithSize) {
            throw new Error(`Unable to find baseQuantity meeting minTradeValue=${minTradeValue.toString()}`);
        }

        const tradeInput = new TradeInput(traderAddress, baseQuantity, Side.LONG);
        const [tradeParam] = tradeInput.simulate(before, quotationWithSize, userSetting);

        const tradeHash = await ctx.walletClients.trader.writeContract({
            address: instrument.address,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(tradeParam)],
        });
        await waitForTx(tradeHash);

        const after = await fetchOnchainContext(instrument.address, instrument.expiry, ctx.rpcConfig, traderAddress);
        expect(after.portfolio.position.size).toBe(tradeParam.size);
    });
});
