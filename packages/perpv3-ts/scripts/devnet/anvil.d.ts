export function waitForRpc(params: { rpcUrl: string; timeoutMs: number }): Promise<void>;

export function getDevnetInitialTimestamp(manifest: { instruments?: Array<{ expiry?: number }> }): number | undefined;

export function buildAnvilArgs(params: {
    host: string;
    port: number;
    chainId: number;
    mnemonic: string;
    loadStatePath?: string;
    dumpStatePath?: string;
    timestamp?: number;
}): string[];

export function resolveAnvilCommand(): { command: string; prefixArgs: string[] };

export function stopAnvil(child: import('node:child_process').ChildProcess | undefined): Promise<void>;
