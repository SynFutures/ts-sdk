import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PERP_EXPIRY = 0xffffffff;
const FUTURES_START_LEAD_SECONDS = 86_400;

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRpc({ rpcUrl, timeoutMs, child, chainId }) {
    const startedAt = Date.now();
    for (;;) {
        if (child && (child.exitCode !== null || child.signalCode !== null))
            throw new Error('Anvil exited before RPC became ready');
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
                signal: globalThis.AbortSignal.timeout(1000),
            });
            const body = await response.json();
            if (
                response.ok &&
                typeof body.result === 'string' &&
                !body.error &&
                (chainId === undefined || BigInt(body.result) === BigInt(chainId))
            ) {
                if (child && (child.exitCode !== null || child.signalCode !== null))
                    throw new Error('Anvil exited during startup');
                return;
            }
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

export function getDevnetInitialTimestamp(manifest) {
    const instruments = Array.isArray(manifest?.instruments) ? manifest.instruments : [];
    const datedExpiries = instruments
        .map((instrument) => instrument?.expiry)
        .filter(
            (expiry) => Number.isSafeInteger(expiry) && expiry !== PERP_EXPIRY && expiry > FUTURES_START_LEAD_SECONDS
        );
    if (datedExpiries.length === 0) return undefined;
    return Math.min(...datedExpiries) - FUTURES_START_LEAD_SECONDS;
}

export function buildAnvilArgs({ host, port, chainId, mnemonic, loadStatePath, dumpStatePath, timestamp }) {
    const args = ['--host', host, '--port', String(port), '--chain-id', String(chainId), '--mnemonic', mnemonic];

    if (loadStatePath) args.push('--load-state', loadStatePath);
    if (dumpStatePath) args.push('--dump-state', dumpStatePath);
    if (timestamp !== undefined) args.push('--timestamp', String(timestamp));

    return args;
}

// Only callers holding the ChildProcess returned by spawn may stop this process group.
export async function stopAnvil(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    const signal = (name) => {
        try {
            process.kill(-child.pid, name);
        } catch {
            child.kill(name);
        }
    };
    signal('SIGTERM');
    let timeout;
    try {
        await Promise.race([
            exited,
            new Promise((resolve) => {
                timeout = setTimeout(resolve, 2_000);
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
    if (child.exitCode === null && child.signalCode === null) {
        signal('SIGKILL');
        await exited;
    }
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

export async function jsonRpc(rpcUrl, method, params) {
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: globalThis.AbortSignal.timeout(5000),
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

export async function startAnvil({ host, chainId, mnemonic, loadStatePath, dumpStatePath, timestamp }) {
    if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error('Devnet requires a local host');
    const port = await pickFreePort(host);
    const rpcUrl = `http://${host}:${port}`;
    const args = buildAnvilArgs({ host, port, chainId, mnemonic, loadStatePath, dumpStatePath, timestamp });
    const { command, prefixArgs } = resolveAnvilCommand();
    const child = spawn(command, [...prefixArgs, ...args], { stdio: 'ignore', detached: true });
    try {
        await once(child, 'spawn');
        await waitForRpc({ rpcUrl, timeoutMs: 15000, child, chainId });
        return { child, rpcUrl };
    } catch (error) {
        await stopAnvil(child);
        throw error;
    }
}
