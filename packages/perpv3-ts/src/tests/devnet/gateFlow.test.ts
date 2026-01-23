import type { Address, Hash } from 'viem';
import { createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { CURRENT_GATE_ABI, encodeDepositParam, encodeWithdrawParam } from '../../index';
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
            abi: ERC20_ABI,
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
            abi: ERC20_ABI,
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
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [wallet.account.address],
        });
        expect(afterWithdrawBalance).toBe(afterDepositBalance + withdrawAmount);
    });
});

