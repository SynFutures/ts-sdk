import type { Address, PublicClient } from 'viem';
import { ApiSigner, AuthInfo } from '../apis/interfaces';
import { HttpClient } from '../utils';

export type BlockTag = 'latest' | 'earliest' | 'pending';

export interface ReadOptions {
    blockNumber?: bigint;
    blockTag?: BlockTag;
}

// Configuration types for API and RPC
export interface ApiConfig {
    chainId: number;
    baseUrl?: string;
    authInfo?: AuthInfo;
    signer?: ApiSigner;
    /** @internal Resolved by PerpClient from baseUrl; callers should not set this directly. */
    httpClient?: HttpClient;
}

export interface RpcConfig {
    chainId: number;
    publicClient: PublicClient;
    observerAddress: Address;
}

// Type guards for config discrimination
export function isApiConfig(config: ApiConfig | RpcConfig): config is ApiConfig {
    return !('publicClient' in config);
}

export function isRpcConfig(config: ApiConfig | RpcConfig): config is RpcConfig {
    return 'publicClient' in config;
}

/**
 * Resolve `ApiConfig.baseUrl` into a dedicated `HttpClient` on the returned config.
 * Idempotent: returns a shallow copy when `httpClient` is already set or no `baseUrl` is provided.
 */
export function resolveApiConfig(config: ApiConfig): ApiConfig {
    if (!config.baseUrl || config.httpClient) {
        return { ...config };
    }
    return { ...config, httpClient: new HttpClient({ baseUrl: config.baseUrl }) };
}
