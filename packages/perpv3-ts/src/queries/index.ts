import type { Address } from 'viem';
import { fetchFuturesPairOrderBook } from '../apis/api';
import type { IFuturesOrderBookAllSteps } from '../apis/interfaces';
import type { PairSnapshot, Quotation } from '../types';
import { fetchOnchainContext as fetchOnchainContextFromApi, inquireByTick as inquireByTickFromApi } from './api';
import {
    fetchOnchainContext as fetchOnchainContextFromRpc,
    fetchOrderBookFromObserver as fetchOrderBookFromObserverRpc,
    inquireByTick as inquireByTickFromRpc,
    type FetchOrderBookOptions,
} from './rpc';
import { isApiConfig } from './config';
import type { ApiConfig, ReadOptions, RpcConfig } from './config';

// ============================================================================
// Unified Data Fetching Functions
// ============================================================================

/**
 * Unified context fetcher that routes to API or RPC based on config type.
 * Automatically fetches portfolio if traderAddress is provided, and quotation if signedSize is provided.
 *
 * @param instrumentAddress - Instrument contract address
 * @param expiry - Expiry timestamp
 * @param config - API or RPC configuration
 * @param traderAddress - Optional trader address to fetch portfolio
 * @param signedSize - Optional signed size to fetch quotation
 * @param options - Optional read options (blockNumber, blockTag) - only used for RPC config
 * @returns PairSnapshot with required fields and optional quotation
 */
export async function fetchOnchainContext(
    instrumentAddress: Address,
    expiry: number,
    config: ApiConfig | RpcConfig,
    traderAddress?: Address,
    signedSize?: bigint,
    options?: ReadOptions
): Promise<PairSnapshot> {
    if (isApiConfig(config)) {
        // API doesn't support options parameter
        return fetchOnchainContextFromApi(instrumentAddress, expiry, config, traderAddress, signedSize);
    }
    return fetchOnchainContextFromRpc(instrumentAddress, expiry, config, traderAddress, signedSize, options);
}

/**
 * Unified inquire by tick function that routes to API or RPC based on config type.
 *
 * @param instrumentAddress - Instrument contract address
 * @param expiry - Expiry timestamp
 * @param tick - Target tick
 * @param config - API or RPC configuration
 * @param options - Optional read options (blockNumber, blockTag) - only used for RPC config
 * @returns Object with size and quotation
 */
export async function inquireByTick(
    instrumentAddress: Address,
    expiry: number,
    tick: number,
    config: ApiConfig | RpcConfig,
    options?: ReadOptions
): Promise<{ size: bigint; quotation: Quotation }> {
    if (isApiConfig(config)) {
        // API doesn't support options parameter
        return inquireByTickFromApi(instrumentAddress, expiry, tick, config);
    }
    return inquireByTickFromRpc(instrumentAddress, expiry, tick, config, options);
}

/**
 * Unified order book fetcher that routes to API or RPC based on config type.
 * Returns the same IFuturesOrderBookAllSteps structure as /market/orderBook.
 *
 * @param instrument - Instrument contract address
 * @param expiry - Expiry timestamp (PERP_EXPIRY for perpetuals)
 * @param config - API or RPC configuration
 * @param length - Optional order book depth (default: 10) - only used for RPC
 * @param options - Optional read options (blockNumber, blockTag) - only used for RPC
 * @returns Order book data with bids/asks
 */
export async function fetchOrderBook(
    instrument: Address,
    expiry: number,
    config: ApiConfig | RpcConfig,
    length?: number,
    options?: ReadOptions
): Promise<IFuturesOrderBookAllSteps | null> {
    if (isApiConfig(config)) {
        return fetchFuturesPairOrderBook(
            {
                chainId: config.chainId,
                address: instrument,
                expiry: expiry,
            },
            config.authInfo
        );
    }

    const fetchOptions: FetchOrderBookOptions | undefined =
        length !== undefined || options ? { length, ...options } : undefined;
    return fetchOrderBookFromObserverRpc(instrument, expiry, config, fetchOptions);
}

// Re-export types
export type { FetchOrderBookOptions } from './rpc';
export type { ApiConfig, RpcConfig, ReadOptions, BlockTag } from './config';
export { isApiConfig, isRpcConfig } from './config';
