import type { Address, Hash } from 'viem';
import { createTestClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { CEX_MARKET_ABI, CURRENT_GATE_ABI, CURRENT_INSTRUMENT_ABI } from '../../index';
import {
    AddInput,
    RemoveInput,
    Side,
    TradeInput,
    UserSetting,
    WAD,
    buildInquireByTickResult,
    encodeAddParam,
    encodeDepositParam,
    encodeRemoveParam,
    encodeTradeParam,
    fetchOnchainContext,
    tickToWad,
} from '../../index';
import { abs, wmul } from '../../math';
import type { PairSnapshot } from '../../types';
import { createDevnetContext } from './devnet';

const ctx = createDevnetContext();

const defaultInstrument = ctx.manifest.defaults.instrument;
const defaultQuote = ctx.manifest.tokens.quotes[defaultInstrument.quoteSymbol];
if (!defaultQuote) {
    throw new Error(`Missing quote token info in manifest for ${defaultInstrument.quoteSymbol}`);
}

const INSTRUMENT_ADDRESS = defaultInstrument.address;
const EXPIRY = defaultInstrument.expiry;

const QUOTE_TOKEN = defaultQuote.address;
const QUOTE_UNIT = 10n ** BigInt(defaultQuote.decimals);
const QUOTE_SCALER = 10n ** BigInt(18 - defaultQuote.decimals);

const MARKET_ADDRESS = ctx.manifest.contracts.markets[defaultInstrument.marketType];
if (!MARKET_ADDRESS) {
    throw new Error(`Missing market address in manifest for marketType=${defaultInstrument.marketType}`);
}

const testClient = createTestClient({ chain: ctx.chain, mode: 'anvil', transport: http(ctx.manifest.rpcUrl) });

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

const MOCK_CHAINLINK_FEEDER_ABI = [
    {
        name: 'currentPrice',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'int256' }],
    },
    {
        name: 'setPriceRawRepresentation',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'newPriceRaw', type: 'int256' }],
        outputs: [],
    },
] as const;

function createUserWallet(addressIndex: number) {
    const account = mnemonicToAccount(ctx.preset.anvil.mnemonic, { addressIndex });
    return createWalletClient({ chain: ctx.chain, transport: http(ctx.manifest.rpcUrl), account });
}

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

async function approveQuote(wallet: ReturnType<typeof createUserWallet>, amount: bigint) {
    const hash = await wallet.writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ctx.manifest.contracts.gate, amount],
    });
    await waitForTx(hash);
}

async function depositQuote(wallet: ReturnType<typeof createUserWallet>, amount: bigint) {
    const hash = await wallet.writeContract({
        address: ctx.manifest.contracts.gate,
        abi: CURRENT_GATE_ABI,
        functionName: 'deposit',
        args: [encodeDepositParam(QUOTE_TOKEN, amount)],
    });
    await waitForTx(hash);
}

async function setLeverage(initialMarginRatio: number, maintenanceMarginRatio: number) {
    const hash = await ctx.walletClients.admin.writeContract({
        address: INSTRUMENT_ADDRESS,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'setLeverage',
        args: [initialMarginRatio, maintenanceMarginRatio],
    });
    await waitForTx(hash);
}

async function adjustSpotPrice(spotWad: bigint, { updateRounds = 10, stepSeconds = 250 } = {}) {
    const [, scaler0, aggregator0, , scaler1, aggregator1] = await ctx.publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: CEX_MARKET_ABI,
        functionName: 'feeders',
        args: [INSTRUMENT_ADDRESS],
    });

    if (aggregator0 === '0x0000000000000000000000000000000000000000') {
        throw new Error('CexMarket feeder aggregator0 is not set');
    }
    if (aggregator1 === '0x0000000000000000000000000000000000000000') {
        throw new Error('CexMarket feeder aggregator1 is not set');
    }

    const answer1 = (await ctx.publicClient.readContract({
        address: aggregator1,
        abi: MOCK_CHAINLINK_FEEDER_ABI,
        functionName: 'currentPrice',
    })) as bigint;
    if (answer1 <= 0n) {
        throw new Error('Invalid aggregator1 price');
    }

    const price1 = answer1 * scaler1;
    const desiredPrice0 = wmul(price1, spotWad);
    const desiredAnswer0 = desiredPrice0 / scaler0;

    const setPriceHash = await ctx.walletClients.admin.writeContract({
        address: aggregator0,
        abi: MOCK_CHAINLINK_FEEDER_ABI,
        functionName: 'setPriceRawRepresentation',
        args: [desiredAnswer0],
    });
    await waitForTx(setPriceHash);

    for (let i = 0; i < updateRounds; i += 1) {
        await testClient.increaseTime({ seconds: stepSeconds });
        const updateHash = await ctx.walletClients.admin.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'update',
            args: [EXPIRY],
        });
        await waitForTx(updateHash);
    }
}

function totalEquity(snapshot: PairSnapshot): bigint {
    const markPrice = snapshot.priceData.markPrice;
    let equity = snapshot.portfolio.position.equity(snapshot.amm, markPrice);
    for (const range of snapshot.portfolio.ranges) {
        equity += range.valueLocked(snapshot.amm, markPrice);
    }
    return equity;
}

describe('devnet IMR simulation (ported from v3-contracts hardhat imrSimulation.test.ts)', () => {
    it('attacker trades to upper boundary', async () => {
        const lpWallet = createUserWallet(3);
        const attackerWallet = createUserWallet(4);

        const transferAmount = 200_000n * QUOTE_UNIT;
        await transferQuote(lpWallet.account.address, transferAmount);
        await transferQuote(attackerWallet.account.address, transferAmount);

        await approveQuote(lpWallet, transferAmount);
        await approveQuote(attackerWallet, transferAmount);

        // Configure IMR/MMR so we can use high leverage (19x) for the boundary trade.
        await setLeverage(500, 250);

        const lpBeforeAdd = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            lpWallet.account.address
        );

        // Range width uses alpha=1.1 (tickDelta ~= 953) like the Hardhat test, even though IMR is 5%.
        const alpha1_1Delta = 953;
        const tickLower = lpBeforeAdd.instrumentSetting.alignRangeTickLower(lpBeforeAdd.amm.tick - alpha1_1Delta);
        const tickUpper = lpBeforeAdd.instrumentSetting.alignRangeTickUpper(lpBeforeAdd.amm.tick + alpha1_1Delta);

        const lpInitialMargin = 100_000n * WAD;
        const addUserSetting = new UserSetting(3600, 50, 2n * WAD);
        const [addParam, addSim] = new AddInput(lpWallet.account.address, lpInitialMargin, tickLower, tickUpper).simulate(
            lpBeforeAdd,
            addUserSetting
        );

        await depositQuote(lpWallet, addParam.amount / QUOTE_SCALER + 1n);

        const addHash = await lpWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'add',
            args: [encodeAddParam(addParam)],
        });
        await waitForTx(addHash);

        const originalSpot = (await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig)).priceData.spotPrice;

        // Move benchmark close to the boundary price so the deviation check allows trading to the boundary.
        await adjustSpotPrice(tickToWad(addSim.range.tickUpper));

        const boundaryQuote = await buildInquireByTickResult(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            Side.LONG,
            addSim.range.tickUpper,
            ctx.rpcConfig
        );

        const attackerBeforeTrade = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            attackerWallet.account.address
        );

        const leverage = 19n * WAD;
        expect(attackerBeforeTrade.instrumentSetting.maxLeverage >= leverage).toBe(true);
        const tradeUserSetting = new UserSetting(3600, 50, leverage);

        const [tradeParam] = new TradeInput(attackerWallet.account.address, boundaryQuote.baseQuantity, Side.LONG).simulate(
            attackerBeforeTrade,
            boundaryQuote,
            tradeUserSetting
        );

        if (tradeParam.amount > 0n) {
            await depositQuote(attackerWallet, tradeParam.amount / QUOTE_SCALER + 1n);
        }

        const tradeHash = await attackerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(tradeParam)],
        });
        await waitForTx(tradeHash);

        // Restore spot/benchmark to the original value for equity checks (matches Hardhat test intent).
        await adjustSpotPrice(originalSpot);

        const attackerAfterTrade = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            attackerWallet.account.address
        );

        expect(attackerAfterTrade.amm.tick >= addSim.range.tickUpper).toBe(true);
        expect(attackerAfterTrade.portfolio.position.size).toBe(tradeParam.size);

        const attackerEquity = totalEquity(attackerAfterTrade);
        expect(attackerAfterTrade.portfolio.position.balance > attackerEquity).toBe(true);

        const lpBeforeRemove = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            lpWallet.account.address
        );
        const lpEquityBeforeRemove = totalEquity(lpBeforeRemove);

        const [removeParam] = new RemoveInput(
            lpWallet.account.address,
            addSim.range.tickLower,
            addSim.range.tickUpper
        ).simulate(lpBeforeRemove, addUserSetting);

        const removeHash = await lpWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'remove',
            args: [encodeRemoveParam(removeParam)],
        });
        await waitForTx(removeHash);

        const lpAfterRemove = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
        const lpEquityAfterRemove = totalEquity(lpAfterRemove);
        expect(abs(lpEquityAfterRemove - lpEquityBeforeRemove) <= 1n).toBe(true);
    });

    it('attacker trades to lower boundary', async () => {
        const lpWallet = createUserWallet(3);
        const attackerWallet = createUserWallet(4);

        const transferAmount = 200_000n * QUOTE_UNIT;
        await transferQuote(lpWallet.account.address, transferAmount);
        await transferQuote(attackerWallet.account.address, transferAmount);

        await approveQuote(lpWallet, transferAmount);
        await approveQuote(attackerWallet, transferAmount);

        await setLeverage(500, 250);

        const lpBeforeAdd = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            lpWallet.account.address
        );

        const alpha1_1Delta = 953;
        const tickLower = lpBeforeAdd.instrumentSetting.alignRangeTickLower(lpBeforeAdd.amm.tick - alpha1_1Delta);
        const tickUpper = lpBeforeAdd.instrumentSetting.alignRangeTickUpper(lpBeforeAdd.amm.tick + alpha1_1Delta);

        const lpInitialMargin = 100_000n * WAD;
        const addUserSetting = new UserSetting(3600, 50, 2n * WAD);
        const [addParam, addSim] = new AddInput(lpWallet.account.address, lpInitialMargin, tickLower, tickUpper).simulate(
            lpBeforeAdd,
            addUserSetting
        );

        await depositQuote(lpWallet, addParam.amount / QUOTE_SCALER + 1n);

        const addHash = await lpWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'add',
            args: [encodeAddParam(addParam)],
        });
        await waitForTx(addHash);

        const originalSpot = (await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig)).priceData.spotPrice;

        await adjustSpotPrice(tickToWad(addSim.range.tickLower));

        const boundaryQuote = await buildInquireByTickResult(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            Side.SHORT,
            addSim.range.tickLower,
            ctx.rpcConfig
        );

        const attackerBeforeTrade = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            attackerWallet.account.address
        );

        const leverage = 19n * WAD;
        expect(attackerBeforeTrade.instrumentSetting.maxLeverage >= leverage).toBe(true);
        const tradeUserSetting = new UserSetting(3600, 50, leverage);

        const [tradeParam] = new TradeInput(
            attackerWallet.account.address,
            boundaryQuote.baseQuantity,
            Side.SHORT
        ).simulate(attackerBeforeTrade, boundaryQuote, tradeUserSetting);

        if (tradeParam.amount > 0n) {
            await depositQuote(attackerWallet, tradeParam.amount / QUOTE_SCALER + 1n);
        }

        const tradeHash = await attackerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(tradeParam)],
        });
        await waitForTx(tradeHash);

        await adjustSpotPrice(originalSpot);

        const attackerAfterTrade = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            attackerWallet.account.address
        );

        expect(attackerAfterTrade.amm.tick <= addSim.range.tickLower).toBe(true);
        expect(attackerAfterTrade.portfolio.position.size).toBe(tradeParam.size);

        const attackerEquity = totalEquity(attackerAfterTrade);
        expect(attackerAfterTrade.portfolio.position.balance > attackerEquity).toBe(true);

        const lpBeforeRemove = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            lpWallet.account.address
        );
        const lpEquityBeforeRemove = totalEquity(lpBeforeRemove);

        const [removeParam] = new RemoveInput(
            lpWallet.account.address,
            addSim.range.tickLower,
            addSim.range.tickUpper
        ).simulate(lpBeforeRemove, addUserSetting);

        const removeHash = await lpWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'remove',
            args: [encodeRemoveParam(removeParam)],
        });
        await waitForTx(removeHash);

        const lpAfterRemove = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
        const lpEquityAfterRemove = totalEquity(lpAfterRemove);
        expect(abs(lpEquityAfterRemove - lpEquityBeforeRemove) <= 1n).toBe(true);
    });
});
