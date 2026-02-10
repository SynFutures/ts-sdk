/* eslint-env node */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRpc({ rpcUrl, timeoutMs }) {
    const startedAt = Date.now();
    for (;;) {
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
            });
            if (response.ok) return;
        } catch {
            // ignore
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`Timed out waiting for Anvil RPC at ${rpcUrl}`);
        }
        await sleep(100);
    }
}

function resolvePackageRoot() {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', '..');
}

/**
 * Resolve an Anvil command that is pinned via the @foundry-rs/anvil dependency.
 *
 * CI runner images may have a preinstalled `anvil` on PATH, which can diverge in behavior.
 * We want the devnet snapshot + tests to always run against the version recorded in devnet metadata.
 */
export function resolveAnvilCommand() {
    const packageRoot = resolvePackageRoot();
    const binMjsPath = path.join(packageRoot, 'node_modules', '@foundry-rs', 'anvil', 'bin.mjs');
    if (!existsSync(binMjsPath)) {
        throw new Error(
            `Missing @foundry-rs/anvil entrypoint at ${binMjsPath}. ` +
                'Run pnpm install and ensure install scripts are allowed for @foundry-rs/anvil (pnpm approve-builds).'
        );
    }

    // Run the wrapper via the current Node to avoid relying on shebang permissions.
    return { command: process.execPath, prefixArgs: [binMjsPath] };
}

export function buildAnvilArgs({ host, port, chainId, mnemonic, loadStatePath, dumpStatePath }) {
    const args = ['--host', host, '--port', String(port), '--chain-id', String(chainId), '--mnemonic', mnemonic];

    if (loadStatePath) args.push('--load-state', loadStatePath);
    if (dumpStatePath) args.push('--dump-state', dumpStatePath);

    return args;
}
