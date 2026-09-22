/* eslint-env node */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';

import { assertStateFresh } from '../devnet-meta.js';
import { buildAnvilArgs, getDevnetInitialTimestamp, resolveAnvilCommand, waitForRpc, stopAnvil } from '../anvil.js';

async function pickFreePort(host) {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, host, () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('Failed to pick a free port (unexpected server address).')));
                return;
            }
            server.close((error) => {
                if (error) reject(error);
                else resolve(address.port);
            });
        });
    });
}

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
    const resolvedPort = await pickFreePort(host);
    const rpcUrl = `http://${host}:${resolvedPort}`;
    const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
    if (manifest.chainId !== chainId) throw new Error('Devnet manifest and preset chain IDs differ.');

    const args = buildAnvilArgs({
        host,
        port: resolvedPort,
        chainId,
        mnemonic,
        loadStatePath: paths.statePath,
        timestamp: getDevnetInitialTimestamp(manifest),
    });

    const { command, prefixArgs } = resolveAnvilCommand();
    const child = spawn(command, [...prefixArgs, ...args], { stdio: 'ignore', detached: true });
    if (!child.pid) throw new Error('Failed to start Anvil (missing pid).');
    globalThis.__perpv3Devnet = child;

    try {
        await waitForRpc({ rpcUrl, timeoutMs: 15_000 });

        if (child.exitCode !== null) {
            throw new Error(
                `Anvil exited immediately (exitCode=${child.exitCode}). Is port ${resolvedPort} already in use?`
            );
        }

        const chainIdHex = await jsonRpc(rpcUrl, 'eth_chainId', []);
        const expectedChainIdHex = `0x${chainId.toString(16)}`;
        if (typeof chainIdHex !== 'string' || chainIdHex.toLowerCase() !== expectedChainIdHex.toLowerCase()) {
            throw new Error(`Unexpected chainId from RPC: got ${chainIdHex}, expected ${expectedChainIdHex}`);
        }

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
