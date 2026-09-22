import { assertTransactionSuccess } from '@derivation-tech/viem-kit';
import { CURRENT_GATE_ABI, encodeDepositParam } from '../../index';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Address, Hash } from 'viem';
import { createPublicClient, createWalletClient, erc20Abi, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import type { RpcConfig } from '../../index';

export type DevnetManifest = {
    chainId: number;
    rpcUrl: string;
    contracts: {
        config: Address;
        gate: Address;
        observer: Address;
        handler: Address;
        markets: Record<string, Address>;
    };
    tokens: {
        wrappedNative: Address;
        quotes: Record<string, { address: Address; decimals: number }>;
    };
    instruments: Array<{
        marketType: string;
        baseSymbol: string;
        quoteSymbol: string;
        address: Address;
        index: `0x${string}`;
        expiry: number;
        symbol: string;
    }>;
    defaults: {
        instrument: {
            marketType: string;
            baseSymbol: string;
            quoteSymbol: string;
            address: Address;
            expiry: number;
        };
    };
};

export type DevnetPreset = {
    anvil: {
        host: string;
        port: number;
        chainId: number;
        mnemonic: string;
    };
};

function loadJsonFile<T>(filePath: string): T {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export function loadDevnetManifest(): DevnetManifest {
    const manifestPath = path.resolve(__dirname, '../../../devnet/manifest.json');
    const manifest = loadJsonFile<DevnetManifest>(manifestPath);
    const rpcUrl = process.env.PERPV3_DEVNET_RPC_URL;
    if (!rpcUrl) throw new Error('Devnet runtime missing. Run tests with jest.devnet.config.js.');
    const url = new URL(rpcUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
        throw new Error('Devnet tests require the local RPC started by globalSetup.');
    }
    return { ...manifest, rpcUrl };
}

export function loadDevnetPreset(): DevnetPreset {
    const presetPath = path.resolve(__dirname, '../../../devnet/preset.json');
    return loadJsonFile<DevnetPreset>(presetPath);
}

export function createDevnetContext() {
    const manifest = loadDevnetManifest();
    const preset = loadDevnetPreset();

    const chain = manifest.chainId === foundry.id ? foundry : { ...foundry, id: manifest.chainId };
    const publicClient = createPublicClient({
        chain,
        transport: http(manifest.rpcUrl),
        batch: { multicall: { deployless: true } },
    });

    const admin = mnemonicToAccount(preset.anvil.mnemonic, { addressIndex: 0 });
    const trader = mnemonicToAccount(preset.anvil.mnemonic, { addressIndex: 1 });

    const adminWalletClient = createWalletClient({ chain, transport: http(manifest.rpcUrl), account: admin });
    const traderWalletClient = createWalletClient({ chain, transport: http(manifest.rpcUrl), account: trader });

    const rpcConfig: RpcConfig = {
        chainId: manifest.chainId,
        publicClient,
        observerAddress: manifest.contracts.observer,
    };

    return {
        manifest,
        preset,
        chain,
        publicClient,
        rpcConfig,
        accounts: {
            admin,
            trader,
        },
        walletClients: {
            admin: adminWalletClient,
            trader: traderWalletClient,
        },
    } as const;
}

/** Helpers are bound to a test's context and quote token; no shared mutable chain state. */
export function createDevnetHelpers(ctx: ReturnType<typeof createDevnetContext>, quoteToken: Address) {
    function createUserWallet(addressIndex: number) {
        const account = mnemonicToAccount(ctx.preset.anvil.mnemonic, { addressIndex });
        return createWalletClient({ chain: ctx.chain, transport: http(ctx.manifest.rpcUrl), account });
    }
    async function waitForTx(hash: Hash) {
        return assertTransactionSuccess(await ctx.publicClient.waitForTransactionReceipt({ hash }));
    }
    async function transferQuote(to: Address, amount: bigint) {
        await waitForTx(
            await ctx.walletClients.admin.writeContract({
                address: quoteToken,
                abi: erc20Abi,
                functionName: 'transfer',
                args: [to, amount],
            })
        );
    }
    async function approveQuote(
        wallet: ReturnType<typeof createUserWallet>,
        amount: bigint,
        spender = ctx.manifest.contracts.gate
    ) {
        await waitForTx(
            await wallet.writeContract({
                address: quoteToken,
                abi: erc20Abi,
                functionName: 'approve',
                args: [spender, amount],
            })
        );
    }
    async function depositQuote(wallet: ReturnType<typeof createUserWallet>, amount: bigint) {
        await waitForTx(
            await wallet.writeContract({
                address: ctx.manifest.contracts.gate,
                abi: CURRENT_GATE_ABI,
                functionName: 'deposit',
                args: [encodeDepositParam(quoteToken, amount)],
            })
        );
    }
    async function getQuoteBalance(address: Address): Promise<bigint> {
        return ctx.publicClient.readContract({
            address: quoteToken,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
        });
    }
    return { createUserWallet, waitForTx, transferQuote, approveQuote, depositQuote, getQuoteBalance };
}
