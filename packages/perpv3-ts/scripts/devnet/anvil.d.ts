import type { ChildProcess } from 'node:child_process';

export function waitForRpc(params: { rpcUrl: string; timeoutMs: number }): Promise<void>;

export function buildAnvilArgs(params: {
    host: string;
    port: number;
    chainId: number;
    mnemonic: string;
    loadStatePath?: string;
    dumpStatePath?: string;
}): string[];

export function startAnvil(params: {
    host: string;
    port: number;
    chainId: number;
    mnemonic: string;
    loadStatePath?: string;
    dumpStatePath?: string;
    runtimeDir?: string;
    detached?: boolean;
}): Promise<{ child: ChildProcess; rpcUrl: string }>;

