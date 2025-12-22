import type { Address, PublicClient } from 'viem';
import { AuthInfo } from '../apis/interfaces';

export type BlockTag = 'latest' | 'earliest' | 'pending';

export interface ReadOptions {
    blockNumber?: bigint;
    blockTag?: BlockTag;
}

// Configuration types for API and RPC
export interface ApiConfig {
    chainId: number;
    authInfo?: AuthInfo;
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
