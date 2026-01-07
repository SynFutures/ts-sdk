import type { Address, Hash } from 'viem';
import { CURRENT_GATE_ABI, CURRENT_INSTRUMENT_ABI } from '../../index';
import {
    PERP_EXPIRY,
    QuotationWithSize,
    Side,
    TradeInput,
    UserSetting,
    WAD,
    encodeDepositParam,
    encodeTradeParam,
    fetchOnchainContext,
    inquireByBaseSize,
} from '../../index';
import { createDevnetContext } from './devnet';

const ctx = createDevnetContext();

const defaultInstrument = ctx.manifest.defaults.instrument;
const defaultQuote = ctx.manifest.tokens.quotes[defaultInstrument.quoteSymbol];
if (!defaultQuote) {
    throw new Error(`Missing quote token info in manifest for ${defaultInstrument.quoteSymbol}`);
}
const QUOTE_TOKEN = defaultQuote.address;
const QUOTE_UNIT = 10n ** BigInt(defaultQuote.decimals);

const ERC20_ABI = [
    {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
    },
] as const;

async function waitForTx(hash: Hash) {
    await ctx.publicClient.waitForTransactionReceipt({ hash });
}

async function transferQuote(to: Address, amount: bigint) {
    const hash = await ctx.walletClients.admin.writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [to, amount],
    });
    await waitForTx(hash);
}

async function approveQuote(amount: bigint) {
    const hash = await ctx.walletClients.trader.writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ctx.manifest.contracts.gate, amount],
    });
    await waitForTx(hash);
}

async function depositQuote(amount: bigint) {
    const hash = await ctx.walletClients.trader.writeContract({
        address: ctx.manifest.contracts.gate,
        abi: CURRENT_GATE_ABI,
        functionName: 'deposit',
        args: [encodeDepositParam(QUOTE_TOKEN, amount)],
    });
    await waitForTx(hash);
}

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

            expect(snapshot.expiry).toBe(PERP_EXPIRY);
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
        await approveQuote(transferAmount);
        await depositQuote(depositAmount);

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

