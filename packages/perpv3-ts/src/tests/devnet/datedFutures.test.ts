import type { Address, Hash } from 'viem';
import { createTestClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import {
    AddInput,
    CURRENT_GATE_ABI,
    CURRENT_INSTRUMENT_ABI,
    PERP_EXPIRY,
    QuotationWithSize,
    Side,
    Status,
    TradeInput,
    UserSetting,
    WAD,
    encodeAddParam,
    encodeDepositParam,
    encodeTradeParam,
    fetchOnchainContext,
    inquireByBaseSize,
} from '../../index';
import { createDevnetContext } from './devnet';

const ctx = createDevnetContext();

const futuresInstrument = ctx.manifest.instruments.find((instrument) => instrument.expiry !== PERP_EXPIRY);
if (!futuresInstrument) {
    throw new Error('Missing dated futures instrument in devnet manifest. Run: pnpm -C packages/perpv3-ts run devnet:regen');
}

const INSTRUMENT_ADDRESS = futuresInstrument.address;
const EXPIRY = futuresInstrument.expiry;

const quoteInfo = ctx.manifest.tokens.quotes[futuresInstrument.quoteSymbol];
if (!quoteInfo) {
    throw new Error(`Missing quote token info in manifest for ${futuresInstrument.quoteSymbol}`);
}

const QUOTE_TOKEN = quoteInfo.address;
const QUOTE_UNIT = 10n ** BigInt(quoteInfo.decimals);

const testClient = createTestClient({ chain: ctx.chain, mode: 'anvil', transport: http(ctx.manifest.rpcUrl) });

const SETTLING_DURATION_SECONDS = 30 * 60;

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

function createUserSetting() {
    return new UserSetting(3600, 50, 4n * WAD);
}

describe('devnet dated futures', () => {
    it('fetchOnchainContext exposes a non-PERP pairSymbol', async () => {
        const snapshot = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, ctx.accounts.trader.address);

        expect(snapshot.expiry).toBe(EXPIRY);
        expect(snapshot.expiry).not.toBe(PERP_EXPIRY);
        expect(snapshot.instrumentSymbol).toBe(futuresInstrument.symbol);
        expect(snapshot.pairSymbol).not.toBe(`${snapshot.instrumentSymbol}-PERP`);
        expect(snapshot.amm.liquidity).toBeGreaterThan(0n);
    });

    it('add liquidity + trade + settle works on a dated expiry', async () => {
        const lpWallet = createUserWallet(3);
        const traderWallet = createUserWallet(4);

        const transferAmount = 50_000n * QUOTE_UNIT;
        const depositAmount = 10_000n * QUOTE_UNIT;

        await transferQuote(lpWallet.account.address, transferAmount);
        await transferQuote(traderWallet.account.address, transferAmount);

        await approveQuote(lpWallet, transferAmount);
        await approveQuote(traderWallet, transferAmount);

        await depositQuote(lpWallet, depositAmount);
        await depositQuote(traderWallet, depositAmount);

        const userSetting = createUserSetting();

        const lpBefore = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
        expect(lpBefore.amm.expiry).toBe(EXPIRY);
        expect(lpBefore.amm.status).toBe(Status.TRADING);

        const tickLower = lpBefore.instrumentSetting.alignRangeTickLower(lpBefore.amm.tick - 2000);
        const tickUpper = lpBefore.instrumentSetting.alignRangeTickUpper(lpBefore.amm.tick + 2000);
        const addMarginWad = 5_000n * WAD;

        const [addParam] = new AddInput(lpWallet.account.address, addMarginWad, tickLower, tickUpper).simulate(lpBefore, userSetting);
        const addHash = await lpWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'add',
            args: [encodeAddParam(addParam)],
        });
        await waitForTx(addHash);

        const lpAfterAdd = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
        expect(lpAfterAdd.portfolio.ranges.length).toBeGreaterThan(0);

        const traderBefore = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        expect(traderBefore.portfolio.position.size).toBe(0n);

        let baseQuantity = WAD / 20n;
        let quotationWithSize: QuotationWithSize | undefined;
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const quotation = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, baseQuantity, ctx.rpcConfig);
            const candidate = new QuotationWithSize(baseQuantity, quotation);
            if (candidate.tradeValue >= traderBefore.instrumentSetting.minTradeValue) {
                quotationWithSize = candidate;
                break;
            }
            baseQuantity *= 2n;
        }

        if (!quotationWithSize) {
            throw new Error('Unable to find a baseQuantity meeting minTradeValue for dated futures trade');
        }

        const [tradeParam] = new TradeInput(traderWallet.account.address, baseQuantity, Side.LONG).simulate(
            traderBefore,
            quotationWithSize,
            userSetting
        );

        const tradeHash = await traderWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(tradeParam)],
        });
        await waitForTx(tradeHash);

        const traderAfterTrade = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        expect(traderAfterTrade.portfolio.position.size).toBe(tradeParam.size);

        const settlingStart = EXPIRY - SETTLING_DURATION_SECONDS;
        const toSettling = settlingStart - traderAfterTrade.blockInfo.timestamp;
        if (toSettling <= 0) {
            throw new Error(
                `Unexpected expiry=${EXPIRY} before settlingStart=${settlingStart} (current timestamp=${traderAfterTrade.blockInfo.timestamp})`
            );
        }

        await testClient.increaseTime({ seconds: toSettling });
        await waitForTx(
            await ctx.walletClients.admin.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'update',
                args: [EXPIRY],
            })
        );

        const settling = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        expect(settling.amm.status).toBe(Status.SETTLING);

        await testClient.increaseTime({ seconds: SETTLING_DURATION_SECONDS + 1 });

        await waitForTx(
            await ctx.walletClients.admin.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'update',
                args: [EXPIRY],
            })
        );

        const settled = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        expect(settled.amm.status).toBe(Status.SETTLED);

        await waitForTx(
            await ctx.walletClients.admin.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'settle',
                args: [EXPIRY, traderWallet.account.address],
            })
        );
        await waitForTx(
            await ctx.walletClients.admin.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'settle',
                args: [EXPIRY, lpWallet.account.address],
            })
        );

        const traderAfterSettle = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        expect(traderAfterSettle.portfolio.position.size).toBe(0n);

        const lpAfterSettle = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
        expect(lpAfterSettle.portfolio.position.size).toBe(0n);
    });
});
