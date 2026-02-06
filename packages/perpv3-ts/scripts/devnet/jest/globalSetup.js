/* eslint-env node */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { assertStateFresh, getDevnetPaths } from '../devnet-meta.js';
import { buildAnvilArgs, resolveAnvilCommand, waitForRpc } from '../anvil.js';

async function isTcpPortAvailable(host, port) {
    return await new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once('error', () => resolve(false));
        server.listen(port, host, () => {
            server.close(() => resolve(true));
        });
    });
}

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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProcessExit(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            process.kill(pid, 0);
        } catch {
            return true; // Process exited
        }
        await sleep(100);
    }
    return false; // Timeout
}

async function killProcessWithEscalation(pid) {
    // Try SIGTERM on process group first, then individual process
    try {
        process.kill(-pid, 'SIGTERM');
    } catch {
        try {
            process.kill(pid, 'SIGTERM');
        } catch {
            return; // Process already gone
        }
    }

    // Wait for graceful exit
    if (await waitForProcessExit(pid, 2000)) return;

    // Escalate to SIGKILL
    try {
        process.kill(-pid, 'SIGKILL');
    } catch {
        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            // ignore
        }
    }

    await waitForProcessExit(pid, 2000);
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

    // Prefer the preset port, but fall back to an OS-assigned free port without killing any existing process.
    // This keeps `devnet/preset.json` stable while avoiding occasional local port collisions.
    const resolvedPort = (await isTcpPortAvailable(host, port)) ? port : await pickFreePort(host);
    const rpcUrl = `http://${host}:${resolvedPort}`;

    const runtimeDir = path.join(paths.devnetRoot, '.runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const runtimePath = path.join(runtimeDir, 'anvil.json');

    const args = buildAnvilArgs({
        host,
        port: resolvedPort,
        chainId,
        mnemonic,
        loadStatePath: paths.statePath,
    });

    const { command, prefixArgs } = resolveAnvilCommand();
    const child = spawn(command, [...prefixArgs, ...args], { stdio: 'ignore', detached: true });
    if (!child.pid) throw new Error('Failed to start Anvil (missing pid).');

    try {
        await waitForRpc({ rpcUrl, timeoutMs: 15_000 });

        if (child.exitCode !== null) {
            throw new Error(`Anvil exited immediately (exitCode=${child.exitCode}). Is port ${resolvedPort} already in use?`);
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
        await killProcessWithEscalation(child.pid);
        throw error;
    }
}
