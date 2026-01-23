export function waitForRpc(params: { rpcUrl: string; timeoutMs: number }): Promise<void>;

export function buildAnvilArgs(params: {
    host: string;
    port: number;
    chainId: number;
    mnemonic: string;
    loadStatePath?: string;
    dumpStatePath?: string;
}): string[];

