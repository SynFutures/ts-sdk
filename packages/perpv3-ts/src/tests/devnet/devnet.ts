import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Address } from 'viem';
import { createPublicClient, createWalletClient, http } from 'viem';
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
    const manifestPath = path.join(process.cwd(), 'devnet', 'manifest.json');
    return loadJsonFile<DevnetManifest>(manifestPath);
}

export function loadDevnetPreset(): DevnetPreset {
    const presetPath = path.join(process.cwd(), 'devnet', 'preset.json');
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
