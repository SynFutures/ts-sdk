import { existsSync, readFileSync } from 'node:fs';

import { assertStateFresh } from '../devnet-meta.js';
import { getDevnetInitialTimestamp, startAnvil, jsonRpc, stopAnvil } from '../anvil.js';

export default async function globalSetup() {
    const { paths } = assertStateFresh();

    if (!existsSync(paths.manifestPath)) {
        throw new Error(
            `Missing devnet manifest at ${paths.manifestPath}. Run: pnpm -C packages/perpv3-ts run devnet:regen`
        );
    }

    const preset = JSON.parse(readFileSync(paths.presetPath, 'utf8'));
    const host = preset?.anvil?.host;
    const chainId = preset?.anvil?.chainId;
    const mnemonic = preset?.anvil?.mnemonic;

    if (!['127.0.0.1', 'localhost'].includes(host) || typeof chainId !== 'number' || typeof mnemonic !== 'string') {
        throw new Error(`Invalid devnet preset at ${paths.presetPath}`);
    }

    // Each run owns its port and child process; no shared runtime file or preset-port fallback.
    const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
    if (manifest.chainId !== chainId) throw new Error('Devnet manifest and preset chain IDs differ.');

    const { child, rpcUrl } = await startAnvil({
        host,
        chainId,
        mnemonic,
        loadStatePath: paths.statePath,
        timestamp: getDevnetInitialTimestamp(manifest),
    });
    globalThis.__perpv3Devnet = child;
    try {
        const observerAddress = manifest?.contracts?.observer;
        if (typeof observerAddress !== 'string' || !observerAddress.startsWith('0x') || observerAddress.length !== 42) {
            throw new Error(`Invalid observer address in manifest: ${paths.manifestPath}`);
        }

        const code = await jsonRpc(rpcUrl, 'eth_getCode', [observerAddress, 'latest']);
        if (typeof code !== 'string' || code === '0x') {
            throw new Error(
                `Loaded devnet state does not contain Observer code at ${observerAddress}. Run: pnpm -C packages/perpv3-ts run devnet:regen`
            );
        }

        process.env.PERPV3_DEVNET_RPC_URL = rpcUrl;

        child.unref();
    } catch (error) {
        await stopAnvil(child);
        delete globalThis.__perpv3Devnet;
        delete process.env.PERPV3_DEVNET_RPC_URL;
        throw error;
    }
}
