import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { assertStateFresh, getDevnetPaths } from '../devnet-meta.js';
import { buildAnvilArgs, waitForRpc } from '../anvil.js';

async function jsonRpc(rpcUrl, method, params) {
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!response.ok) {
        throw new Error(`JSON-RPC ${method} failed with HTTP ${response.status}`);
    }
    const body = await response.json();
    if (body.error) {
        throw new Error(`JSON-RPC ${method} error: ${JSON.stringify(body.error)}`);
    }
    return body.result;
}

export default async function globalSetup() {
    const { paths } = assertStateFresh();

    if (!existsSync(paths.manifestPath)) {
        throw new Error(`Missing devnet manifest at ${paths.manifestPath}. Run: pnpm -C packages/perpv3-ts run devnet:regen`);
    }

    const preset = JSON.parse(readFileSync(paths.presetPath, 'utf8'));
    const host = preset?.anvil?.host;
    const port = preset?.anvil?.port;
    const chainId = preset?.anvil?.chainId;
    const mnemonic = preset?.anvil?.mnemonic;

    if (typeof host !== 'string' || typeof port !== 'number' || typeof chainId !== 'number' || typeof mnemonic !== 'string') {
        throw new Error(`Invalid devnet preset at ${paths.presetPath}`);
    }

    const rpcUrl = `http://${host}:${port}`;

    const runtimeDir = path.join(paths.devnetRoot, '.runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const runtimePath = path.join(runtimeDir, 'anvil.json');

    const args = buildAnvilArgs({
        host,
        port,
        chainId,
        mnemonic,
        loadStatePath: paths.statePath,
    });

    const child = spawn('anvil', args, { stdio: 'ignore', detached: true });
    if (!child.pid) throw new Error('Failed to start Anvil (missing pid).');

    try {
        await waitForRpc({ rpcUrl, timeoutMs: 15_000 });

        if (child.exitCode !== null) {
            throw new Error(`Anvil exited immediately (exitCode=${child.exitCode}). Is port ${port} already in use?`);
        }

        const chainIdHex = await jsonRpc(rpcUrl, 'eth_chainId', []);
        const expectedChainIdHex = `0x${chainId.toString(16)}`;
        if (typeof chainIdHex !== 'string' || chainIdHex.toLowerCase() !== expectedChainIdHex.toLowerCase()) {
            throw new Error(`Unexpected chainId from RPC: got ${chainIdHex}, expected ${expectedChainIdHex}`);
        }

        const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
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

        writeFileSync(runtimePath, JSON.stringify({ pid: child.pid, rpcUrl, chainId }, null, 2));

        child.unref();
    } catch (error) {
        try {
            process.kill(-child.pid, 'SIGTERM');
        } catch {
            try {
                process.kill(child.pid, 'SIGTERM');
            } catch {
                // ignore
            }
        }
        throw error;
    }
}
