import { erc20Abi } from 'viem';

import { CURRENT_GATE_ABI, encodeWithdrawParam } from '../../index';
import { createDevnetContext, createDevnetHelpers } from './devnet';

const ctx = createDevnetContext();

const defaultInstrument = ctx.manifest.defaults.instrument;
const defaultQuote = ctx.manifest.tokens.quotes[defaultInstrument.quoteSymbol];
if (!defaultQuote) {
    throw new Error(`Missing quote token info in manifest for ${defaultInstrument.quoteSymbol}`);
}

const QUOTE_TOKEN = defaultQuote.address;
const { createUserWallet, waitForTx, transferQuote, approveQuote, depositQuote } = createDevnetHelpers(
    ctx,
    QUOTE_TOKEN
);
const QUOTE_UNIT = 10n ** BigInt(defaultQuote.decimals);

async function withdrawQuote(wallet: ReturnType<typeof createUserWallet>, amount: bigint) {
    const hash = await wallet.writeContract({
        address: ctx.manifest.contracts.gate,
        abi: CURRENT_GATE_ABI,
        functionName: 'withdraw',
        args: [encodeWithdrawParam(QUOTE_TOKEN, amount)],
    });
    await waitForTx(hash);
}

describe('devnet Gate deposit/withdraw (ported from v3-contracts hardhat Instrument tests)', () => {
    it('withdraw reverts with no funds', async () => {
        const wallet = createUserWallet(3);

        const reserve = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.gate,
            abi: CURRENT_GATE_ABI,
            functionName: 'reserveOf',
            args: [QUOTE_TOKEN, wallet.account.address],
        });
        expect(reserve).toBe(0n);

        await expect(withdrawQuote(wallet, 1n * QUOTE_UNIT)).rejects.toThrow(/InsufficientReserve/i);
    });

    it('deposit then withdraw updates reserves and token balances', async () => {
        const wallet = createUserWallet(3);

        const transferAmount = 10_000n * QUOTE_UNIT;
        const depositAmount = 1_000n * QUOTE_UNIT;
        const withdrawAmount = 200n * QUOTE_UNIT;

        await transferQuote(wallet.account.address, transferAmount);
        await approveQuote(wallet, transferAmount);

        const beforeBalance = await ctx.publicClient.readContract({
            address: QUOTE_TOKEN,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [wallet.account.address],
        });

        await depositQuote(wallet, depositAmount);

        const reserveAfterDeposit = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.gate,
            abi: CURRENT_GATE_ABI,
            functionName: 'reserveOf',
            args: [QUOTE_TOKEN, wallet.account.address],
        });
        expect(reserveAfterDeposit).toBe(depositAmount);

        const afterDepositBalance = await ctx.publicClient.readContract({
            address: QUOTE_TOKEN,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [wallet.account.address],
        });
        expect(afterDepositBalance).toBe(beforeBalance - depositAmount);

        await withdrawQuote(wallet, withdrawAmount);

        const reserveAfterWithdraw = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.gate,
            abi: CURRENT_GATE_ABI,
            functionName: 'reserveOf',
            args: [QUOTE_TOKEN, wallet.account.address],
        });
        expect(reserveAfterWithdraw).toBe(depositAmount - withdrawAmount);

        const afterWithdrawBalance = await ctx.publicClient.readContract({
            address: QUOTE_TOKEN,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [wallet.account.address],
        });
        expect(afterWithdrawBalance).toBe(afterDepositBalance + withdrawAmount);
    });
});
