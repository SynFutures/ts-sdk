import type { Address, Hash } from 'viem';
import { CURRENT_GATE_ABI, CURRENT_INSTRUMENT_ABI } from '../../index';
import {
    AddInput,
    PERP_EXPIRY,
    QuotationWithSize,
    RemoveInput,
    Side,
    TradeInput,
    UserSetting,
    WAD,
    encodeAddParam,
    encodeDepositParam,
    encodeRemoveParam,
    encodeTradeParam,
    fetchOnchainContext,
    inquireByBaseSize,
} from '../../index';
import { Range } from '../../types';
import { createDevnetContext } from './devnet';

const ctx = createDevnetContext();

const defaultInstrument = ctx.manifest.defaults.instrument;
const defaultQuote = ctx.manifest.tokens.quotes[defaultInstrument.quoteSymbol];
if (!defaultQuote) {
    throw new Error(`Missing quote token info in manifest for ${defaultInstrument.quoteSymbol}`);
}
const QUOTE_TOKEN = defaultQuote.address;
const QUOTE_UNIT = 10n ** BigInt(defaultQuote.decimals);
const INSTRUMENT_ADDRESS = defaultInstrument.address;
const EXPIRY = defaultInstrument.expiry;
const BASE_TRADE_SIZE = WAD / 20n; // 0.05 base, avoids size-related reverts on small-liquidity devnet
const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_LEVERAGE = 4n * WAD;

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
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ type: 'uint256' }],
    },
] as const;

async function waitForTx(hash: Hash) {
    await ctx.publicClient.waitForTransactionReceipt({ hash });
}

async function transferQuote(from: 'admin', to: Address, amount: bigint) {
    const hash = await ctx.walletClients[from].writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [to, amount],
    });
    await waitForTx(hash);
}

async function approveQuote(owner: 'trader', spender: Address, amount: bigint) {
    const hash = await ctx.walletClients[owner].writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
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
    return new UserSetting(3600, DEFAULT_SLIPPAGE_BPS, DEFAULT_LEVERAGE);
}

describe('devnet SDK (ported from v3-contracts hardhat sdk_test)', () => {
    it('inquireByBaseSize matches Instrument.inquire', async () => {
        const signedSize = BASE_TRADE_SIZE;

        const quotationFromObserver = await inquireByBaseSize(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            signedSize,
            ctx.rpcConfig
        );

        const quotationFromInstrument = (await ctx.publicClient.readContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'inquire',
            args: [EXPIRY, signedSize],
        })) as typeof quotationFromObserver;

        expect(quotationFromInstrument).toEqual(quotationFromObserver);
    });

    it('deposit updates quote reserve in OnchainContext', async () => {
        const traderAddress = ctx.accounts.trader.address;
        const transferAmount = 10_000n * QUOTE_UNIT;
        const depositAmount = 1_000n * QUOTE_UNIT;

        await transferQuote('admin', traderAddress, transferAmount);
        await approveQuote('trader', ctx.manifest.contracts.gate, transferAmount);

        const before = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            traderAddress
        );

        await depositQuote(depositAmount);

        const after = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            traderAddress
        );

        expect(after.quoteState.reserve - before.quoteState.reserve).toBe(depositAmount);
    });

    it('add/remove liquidity works via AddInput/RemoveInput + calldata encoding', async () => {
        const traderAddress = ctx.accounts.trader.address;
        const transferAmount = 20_000n * QUOTE_UNIT;
        const depositAmount = 10_000n * QUOTE_UNIT;

        await transferQuote('admin', traderAddress, transferAmount);
        await approveQuote('trader', ctx.manifest.contracts.gate, transferAmount);
        await depositQuote(depositAmount);

        const userSetting = createUserSetting();

        const beforeAdd = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            traderAddress
        );
        expect(beforeAdd.portfolio.ranges.length).toBe(0);

        const { tick: ammTick } = beforeAdd.amm;
        const delta = beforeAdd.instrumentSetting.minTickDelta;
        const tickLower = beforeAdd.instrumentSetting.alignRangeTickLower(ammTick - delta);
        const tickUpper = beforeAdd.instrumentSetting.alignRangeTickUpper(ammTick + delta);

        const addInput = new AddInput(traderAddress, 5_000n * WAD, tickLower, tickUpper);
        const [addParam] = addInput.simulate(beforeAdd, userSetting);

        const addHash = await ctx.walletClients.trader.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'add',
            args: [encodeAddParam(addParam)],
        });
        await waitForTx(addHash);

        const afterAdd = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            traderAddress
        );

        expect(afterAdd.portfolio.ranges.length).toBe(1);
        expect(afterAdd.portfolio.rids.length).toBe(1);
        expect(afterAdd.portfolio.rids[0]).not.toBeUndefined();

        const rangeId = afterAdd.portfolio.rids[0];
        if (rangeId === undefined) throw new Error('Missing range rid after add');
        const { tickLower: addedLower, tickUpper: addedUpper } = Range.unpackKey(rangeId);

        const removeInput = new RemoveInput(traderAddress, addedLower, addedUpper);
        const [removeParam] = removeInput.simulate(afterAdd, userSetting);

        const removeHash = await ctx.walletClients.trader.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'remove',
            args: [encodeRemoveParam(removeParam)],
        });
        await waitForTx(removeHash);

        const afterRemove = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            traderAddress
        );

        expect(afterRemove.portfolio.ranges.length).toBe(0);
    });

    it('trade works via TradeInput + calldata encoding', async () => {
        const traderAddress = ctx.accounts.trader.address;
        const transferAmount = 20_000n * QUOTE_UNIT;
        const depositAmount = 10_000n * QUOTE_UNIT;

        await transferQuote('admin', traderAddress, transferAmount);
        await approveQuote('trader', ctx.manifest.contracts.gate, transferAmount);
        await depositQuote(depositAmount);

        const userSetting = createUserSetting();

        const before = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            traderAddress
        );
        expect(before.expiry).toBe(PERP_EXPIRY);
        expect(before.portfolio.position.size).toBe(0n);

        const minTradeValue = before.instrumentSetting.minTradeValue;
        let baseQuantity = BASE_TRADE_SIZE;
        let quotationWithSize: QuotationWithSize | undefined;

        for (let attempt = 0; attempt < 8; attempt += 1) {
            const signedSize = baseQuantity; // LONG
            const quotation = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, signedSize, ctx.rpcConfig);
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
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(tradeParam)],
        });
        await waitForTx(tradeHash);

        const after = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            traderAddress
        );

        expect(after.portfolio.position.size).toBe(tradeParam.size);
        expect(after.portfolio.position.size).not.toBe(0n);
    });
});
