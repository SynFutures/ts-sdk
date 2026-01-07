import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';

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

export function buildAnvilArgs({ host, port, chainId, mnemonic, loadStatePath, dumpStatePath }) {
    const args = ['--host', host, '--port', String(port), '--chain-id', String(chainId), '--mnemonic', mnemonic];

    if (loadStatePath) args.push('--load-state', loadStatePath);
    if (dumpStatePath) args.push('--dump-state', dumpStatePath);

    return args;
}

export async function startAnvil({
    host,
    port,
    chainId,
    mnemonic,
    loadStatePath,
    dumpStatePath,
    runtimeDir,
    detached,
}) {
    const rpcUrl = `http://${host}:${port}`;

    let stdout = 'ignore';
    let stderr = 'ignore';
    if (runtimeDir) {
        mkdirSync(runtimeDir, { recursive: true });
        const outPath = path.join(runtimeDir, 'anvil.log');
        const stream = createWriteStream(outPath, { flags: 'a' });
        stdout = stream;
        stderr = stream;
    }

    const args = buildAnvilArgs({ host, port, chainId, mnemonic, loadStatePath, dumpStatePath });
    const child = spawn('anvil', args, {
        stdio: ['ignore', stdout, stderr],
        detached: Boolean(detached),
    });

    if (!child.pid) throw new Error('Failed to start Anvil process (missing pid).');

    await waitForRpc({ rpcUrl, timeoutMs: 15_000 });

    return { child, rpcUrl };
}
