import { mnemonicToAccount } from 'viem/accounts';
import { createWalletClient, encodeFunctionData, http, zeroAddress } from 'viem';

import {
    CURRENT_GATE_ABI,
    CURRENT_GELATO_RELAY_ROUTER_ABI,
    encodeDepositParam,
    encodeWithdrawParam,
    splitSignature,
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

function createUserWallet(addressIndex: number) {
    const account = mnemonicToAccount(ctx.preset.anvil.mnemonic, { addressIndex });
    return createWalletClient({ chain: ctx.chain, transport: http(ctx.manifest.rpcUrl), account });
}

describe('devnet GelatoRelayRouter (ported from v3-contracts hardhat relayRouter tests)', () => {
    it('supports direct setSubAccount/removeSubAccount', async () => {
        const userWallet = createUserWallet(3);
        const subAccountWallet = createUserWallet(4);

        const setHash = await userWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'setSubAccount',
            args: [subAccountWallet.account.address],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: setHash });

        const currentSubAccount = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'getSubAccount',
            args: [userWallet.account.address],
        });
        expect(currentSubAccount).toBe(subAccountWallet.account.address);

        const removeHash = await userWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'removeSubAccount',
            args: [],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: removeHash });

        const cleared = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'getSubAccount',
            args: [userWallet.account.address],
        });
        expect(cleared).toBe(zeroAddress);
    });

    it('supports executeSubAccountManagement via EIP-712 signature', async () => {
        const userWallet = createUserWallet(3);
        const subAccountWallet = createUserWallet(4);

        const nonce = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'getNonce',
            args: [userWallet.account.address],
        });

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        const domain = {
            name: 'GelatoRelayRouter',
            version: '1',
            chainId: BigInt(ctx.manifest.chainId),
            verifyingContract: ctx.manifest.contracts.handler,
        } as const;

        const types = {
            SubAccountManagement: [
                { name: 'action', type: 'uint8' },
                { name: 'subAccount', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
            ],
        } as const;

        const setMessage = {
            action: 0,
            subAccount: subAccountWallet.account.address,
            nonce,
            deadline,
        } as const;

        const setSig = await userWallet.signTypedData({
            domain,
            types,
            primaryType: 'SubAccountManagement',
            message: setMessage,
        });
        const { v: setV, r: setR, s: setS } = splitSignature(setSig);

        const setHash = await ctx.walletClients.admin.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'executeSubAccountManagement',
            args: [userWallet.account.address, setMessage.action, setMessage.subAccount, deadline, setV, setR, setS],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: setHash });

        const currentSubAccount = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'getSubAccount',
            args: [userWallet.account.address],
        });
        expect(currentSubAccount).toBe(subAccountWallet.account.address);

        const removeMessage = {
            action: 1,
            subAccount: zeroAddress,
            nonce: nonce + 1n,
            deadline,
        } as const;

        const removeSig = await userWallet.signTypedData({
            domain,
            types,
            primaryType: 'SubAccountManagement',
            message: removeMessage,
        });
        const { v: removeV, r: removeR, s: removeS } = splitSignature(removeSig);

        const removeHash = await ctx.walletClients.admin.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'executeSubAccountManagement',
            args: [
                userWallet.account.address,
                removeMessage.action,
                removeMessage.subAccount,
                deadline,
                removeV,
                removeR,
                removeS,
            ],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: removeHash });

        const cleared = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'getSubAccount',
            args: [userWallet.account.address],
        });
        expect(cleared).toBe(zeroAddress);
    });

    it('supports gate.depositFor via router.batch (directSender mode)', async () => {
        const userWallet = createUserWallet(3);
        const subAccountWallet = createUserWallet(4);

        const setHash = await userWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'setSubAccount',
            args: [subAccountWallet.account.address],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: setHash });

        const transferAmount = 10_000n * QUOTE_UNIT;
        const depositAmount = 1_000n * QUOTE_UNIT;

        const transferHash = await ctx.walletClients.admin.writeContract({
            address: QUOTE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [userWallet.account.address, transferAmount],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: transferHash });

        const approveHash = await userWallet.writeContract({
            address: QUOTE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ctx.manifest.contracts.gate, transferAmount],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: approveHash });

        const depositArg = encodeDepositParam(QUOTE_TOKEN, depositAmount);
        const gateCallData = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'depositFor',
            args: [userWallet.account.address, depositArg],
        });

        const batchHash = await subAccountWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'batch',
            args: [subAccountWallet.account.address, userWallet.account.address, ctx.manifest.contracts.gate, gateCallData, false],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: batchHash });

        const reserve = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.gate,
            abi: CURRENT_GATE_ABI,
            functionName: 'reserveOf',
            args: [QUOTE_TOKEN, userWallet.account.address],
        });
        expect(reserve).toBe(depositAmount);
    });

    it('supports gate.withdrawFor via router.batch (directSender mode)', async () => {
        const userWallet = createUserWallet(3);
        const subAccountWallet = createUserWallet(4);

        const setHash = await userWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'setSubAccount',
            args: [subAccountWallet.account.address],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: setHash });

        const transferAmount = 10_000n * QUOTE_UNIT;
        const depositAmount = 1_000n * QUOTE_UNIT;
        const withdrawAmount = 200n * QUOTE_UNIT;

        const transferHash = await ctx.walletClients.admin.writeContract({
            address: QUOTE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [userWallet.account.address, transferAmount],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: transferHash });

        const approveHash = await userWallet.writeContract({
            address: QUOTE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ctx.manifest.contracts.gate, transferAmount],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: approveHash });

        const depositArg = encodeDepositParam(QUOTE_TOKEN, depositAmount);
        const gateDepositCallData = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'depositFor',
            args: [userWallet.account.address, depositArg],
        });

        const depositHash = await subAccountWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'batch',
            args: [
                subAccountWallet.account.address,
                userWallet.account.address,
                ctx.manifest.contracts.gate,
                gateDepositCallData,
                false,
            ],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: depositHash });

        const balanceAfterDeposit = await ctx.publicClient.readContract({
            address: QUOTE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [userWallet.account.address],
        });

        const withdrawArg = encodeWithdrawParam(QUOTE_TOKEN, withdrawAmount);
        const gateWithdrawCallData = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'withdrawFor',
            args: [userWallet.account.address, withdrawArg],
        });

        const withdrawHash = await subAccountWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'batch',
            args: [
                subAccountWallet.account.address,
                userWallet.account.address,
                ctx.manifest.contracts.gate,
                gateWithdrawCallData,
                false,
            ],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: withdrawHash });

        const reserveAfterWithdraw = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.gate,
            abi: CURRENT_GATE_ABI,
            functionName: 'reserveOf',
            args: [QUOTE_TOKEN, userWallet.account.address],
        });
        expect(reserveAfterWithdraw).toBe(depositAmount - withdrawAmount);

        const balanceAfterWithdraw = await ctx.publicClient.readContract({
            address: QUOTE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [userWallet.account.address],
        });
        expect(balanceAfterWithdraw).toBe(balanceAfterDeposit + withdrawAmount);
    });

    it('supports gate.depositFor via router.batchMulticall (directSender mode)', async () => {
        const userWallet = createUserWallet(3);
        const subAccountWallet = createUserWallet(4);

        const setHash = await userWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'setSubAccount',
            args: [subAccountWallet.account.address],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: setHash });

        const transferAmount = 10_000n * QUOTE_UNIT;
        const depositAmount0 = 400n * QUOTE_UNIT;
        const depositAmount1 = 600n * QUOTE_UNIT;

        const transferHash = await ctx.walletClients.admin.writeContract({
            address: QUOTE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [userWallet.account.address, transferAmount],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: transferHash });

        const approveHash = await userWallet.writeContract({
            address: QUOTE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ctx.manifest.contracts.gate, transferAmount],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: approveHash });

        const depositArg0 = encodeDepositParam(QUOTE_TOKEN, depositAmount0);
        const depositArg1 = encodeDepositParam(QUOTE_TOKEN, depositAmount1);

        const callData0 = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'depositFor',
            args: [userWallet.account.address, depositArg0],
        });
        const callData1 = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'depositFor',
            args: [userWallet.account.address, depositArg1],
        });

        const batchHash = await subAccountWallet.writeContract({
            address: ctx.manifest.contracts.handler,
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'batchMulticall',
            args: [
                subAccountWallet.account.address,
                userWallet.account.address,
                [ctx.manifest.contracts.gate, ctx.manifest.contracts.gate],
                [callData0, callData1],
                false,
            ],
        });
        await ctx.publicClient.waitForTransactionReceipt({ hash: batchHash });

        const reserve = await ctx.publicClient.readContract({
            address: ctx.manifest.contracts.gate,
            abi: CURRENT_GATE_ABI,
            functionName: 'reserveOf',
            args: [QUOTE_TOKEN, userWallet.account.address],
        });
        expect(reserve).toBe(depositAmount0 + depositAmount1);
    });

    it('reverts when subAccount is not mapped to user', async () => {
        const userWallet = createUserWallet(3);
        const subAccountWallet = createUserWallet(4);

        const depositArg = encodeDepositParam(QUOTE_TOKEN, 1n * QUOTE_UNIT);
        const gateCallData = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'depositFor',
            args: [userWallet.account.address, depositArg],
        });

        await expect(
            subAccountWallet.writeContract({
                address: ctx.manifest.contracts.handler,
                abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                functionName: 'batch',
                args: [
                    subAccountWallet.account.address,
                    userWallet.account.address,
                    ctx.manifest.contracts.gate,
                    gateCallData,
                    false,
                ],
            })
        ).rejects.toThrow(/SubAccount|Owner|Caller|mapped|Invalid/i);
    });
});
