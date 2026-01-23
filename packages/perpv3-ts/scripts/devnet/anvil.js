/* eslint-env node */

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
