import type { Address, PublicClient } from 'viem';
import { ApiSigner, AuthInfo } from '../apis/interfaces';
import type { HttpClientConfig } from '../utils/http';
import type { ApiAuthSigner } from '../utils/mm';

export type BlockTag = 'latest' | 'earliest' | 'pending';

export interface ReadOptions {
    blockNumber?: bigint;
    blockTag?: BlockTag;
}

// Configuration types for API and RPC
export interface ApiConfig extends HttpClientConfig {
    chainId: number;
    authInfo?: AuthInfo | Pick<ApiAuthSigner, 'sign'>;
    signer?: ApiSigner;
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
