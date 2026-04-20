import type { Address } from 'viem';
import { DEFAULT_PUBLIC_WS_URL } from './apis/constants';
import type {
    InstrumentStreamData,
    MarketPairInfoChangedData,
    OrderBookStreamData,
    PortfolioStreamData,
    PublicWebsocketClientOptions,
    TradesStreamData,
} from './apis/websocket';
import {
    fetchOnchainContext,
    fetchOrderBook,
    inquireByBaseSize,
    inquireByTick,
    isApiConfig,
    type ApiConfig,
    type ReadOptions,
    type RpcConfig,
} from './queries';
import {
    UserSetting,
    type PairSnapshot,
    type Quotation,
} from './types';
import { WebSocketManager } from './wss';
import { httpClient as defaultHttpClient, MarketMakerModule, MarketModule } from './apis';
import { HttpClient } from './utils';

function resolveApiConfig(config: ApiConfig): ApiConfig {
    if (!config.baseUrl || config.httpClient) {
        return config;
    }
    return { ...config, httpClient: new HttpClient({ baseUrl: config.baseUrl }) };
}

/**
 * PerpClient is a scoped client for interacting with a specific trading pair (instrument + expiry).
 * It centralizes configuration (config, userSetting, instrumentAddress, expiry) and provides
 * a clean API for queries and WebSocket subscriptions.
 *
 * For simulations, use the input classes directly (TradeInput, PlaceInput, etc.) with snapshots
 * fetched via getSnapshot().
 */
export class PerpClient {
    private readonly _config: ApiConfig | RpcConfig;
    private readonly _userSetting: UserSetting;
    private readonly _instrumentAddress: Address;
    private readonly _expiry: number;
    private readonly _rpcFallback?: RpcConfig;
    private readonly wsManager: WebSocketManager;
    private readonly wsUrl: string;
    private readonly wsOptions?: PublicWebsocketClientOptions;

    private readonly _mm?: MarketMakerModule;
    private readonly _market?: MarketModule;

    /**
     * Create a new PerpClient instance.
     * @param config - API or RPC configuration
     * @param userSetting - User settings (leverage, slippage, deadline, etc.)
     * @param instrumentAddress - Instrument contract address
     * @param expiry - Expiry timestamp (use PERP_EXPIRY for perpetuals)
     * @param options - Optional WebSocket configuration
     */
    constructor(
        config: ApiConfig | RpcConfig,
        userSetting: UserSetting,
        instrumentAddress: Address,
        expiry: number,
        options?: {
            wsManager?: WebSocketManager; // Optional - defaults to singleton
            wsUrl?: string;
            wsOptions?: PublicWebsocketClientOptions;
            /**
             * Optional RPC config for falling back to onchain reads when API requests fail.
             * Only used when `config` is `ApiConfig`.
             */
            rpcFallback?: RpcConfig;
        }
    ) {
        this._config = isApiConfig(config) ? resolveApiConfig(config) : config;
        this._userSetting = userSetting;
        this._instrumentAddress = instrumentAddress;
        this._expiry = expiry;
        this._rpcFallback = isApiConfig(this._config) ? options?.rpcFallback : undefined;
        if (isApiConfig(this._config) && this._rpcFallback && this._config.chainId !== this._rpcFallback.chainId) {
            throw new Error(
                `rpcFallback.chainId (${this._rpcFallback.chainId}) must match ApiConfig.chainId (${this._config.chainId})`
            );
        }
        this.wsManager = options?.wsManager ?? WebSocketManager.getInstance();
        this.wsUrl = options?.wsUrl ?? DEFAULT_PUBLIC_WS_URL;
        this.wsOptions = options?.wsOptions;
        if (isApiConfig(this._config)) {
            const client = this._config.httpClient ?? defaultHttpClient;
            if (this._config.authInfo) {
                this._mm = new MarketMakerModule(client, this._config.authInfo);
            }
            if (this._config.signer) {
                this._market = new MarketModule(client, this._config.signer);
            }
        }
    }

    /**
     * Get the instrument address this client is scoped to.
     */
    get instrumentAddress(): Address {
        return this._instrumentAddress;
    }

    /**
     * Get the expiry this client is scoped to.
     */
    get expiry(): number {
        return this._expiry;
    }

    /**
     * Get the user setting configured for this client.
     */
    get userSetting(): UserSetting {
        return this._userSetting;
    }

    /**
     * Get the config (API or RPC) used by this client.
     */
    get config(): ApiConfig | RpcConfig {
        return this._config;
    }

    /**
     * Gets the Market Maker module. Throws an error if not initialized.
     */
    get mm(): MarketMakerModule {
        if (!this._mm) {
            throw new Error('MarketMaker module is not initialized. Please check if the config is an API config and has authInfo.');
        }
        return this._mm;
    }

    /**
     * Gets the Market module. Throws an error if not initialized.
     */
    get market(): MarketModule {
        if (!this._market) {
            throw new Error('Market module is not initialized. Please check if the config is an API config and has signer.');
        }
        return this._market;
    }

    /**
     * Check if this client is scoped to a specific pair.
     */
    isForPair(instrumentAddress: Address, expiry: number): boolean {
        return this._instrumentAddress === instrumentAddress && this._expiry === expiry;
    }

    // ============================================================================
    // Query Methods
    // ============================================================================

    /**
     * Fetch on-chain context (snapshot) for this pair.
     *
     * If this client is created with an API config and `rpcFallback` is provided, this will use the API by default
     * and fall back to RPC reads when the API request fails.
     * @param traderAddress - Optional trader address to fetch portfolio
     * @param signedSize - Optional signed size to fetch quotation
     * @param options - Optional read options (blockNumber, blockTag) - only used for RPC config
     * @returns PairSnapshot with required fields and optional quotation
     */
    async getSnapshot(traderAddress?: Address, signedSize?: bigint, options?: ReadOptions): Promise<PairSnapshot> {
        if (isApiConfig(this._config) && this._rpcFallback) {
            // Market API endpoints require an `ApiSigner`. When no signer is provided, skip the API path entirely and
            // use `rpcFallback` directly (otherwise we'd just throw and catch to reach the same result).
            if (!this._config.signer) {
                return fetchOnchainContext(
                    this._instrumentAddress,
                    this._expiry,
                    this._rpcFallback,
                    traderAddress,
                    signedSize,
                    options
                );
            }

            try {
                return await fetchOnchainContext(
                    this._instrumentAddress,
                    this._expiry,
                    this._config,
                    traderAddress,
                    signedSize
                );
            } catch (apiError) {
                try {
                    return await fetchOnchainContext(
                        this._instrumentAddress,
                        this._expiry,
                        this._rpcFallback,
                        traderAddress,
                        signedSize,
                        options
                    );
                } catch (rpcError) {
                    throw new AggregateError(
                        [apiError, rpcError],
                        'PerpClient.getSnapshot failed: API request and rpcFallback request both failed'
                    );
                }
            }
        }

        return fetchOnchainContext(this._instrumentAddress, this._expiry, this._config, traderAddress, signedSize, options);
    }

    /**
     * Inquire by tick for this pair.
     * @param tick - Target tick
     * @param options - Optional read options (blockNumber, blockTag) - only used for RPC config
     * @returns Object with size and quotation
     */
    async getQuotation(tick: number, options?: ReadOptions): Promise<{ size: bigint; quotation: Quotation }> {
        if (isApiConfig(this._config) && this._rpcFallback) {
            // Market API endpoints require an `ApiSigner`. When no signer is provided, skip the API path entirely and
            // use `rpcFallback` directly (otherwise we'd just throw and catch to reach the same result).
            if (!this._config.signer) {
                return inquireByTick(this._instrumentAddress, this._expiry, tick, this._rpcFallback, options);
            }

            try {
                return await inquireByTick(this._instrumentAddress, this._expiry, tick, this._config);
            } catch (apiError) {
                try {
                    return await inquireByTick(this._instrumentAddress, this._expiry, tick, this._rpcFallback, options);
                } catch (rpcError) {
                    throw new AggregateError(
                        [apiError, rpcError],
                        'PerpClient.getQuotation failed: API request and rpcFallback request both failed'
                    );
                }
            }
        }

        return inquireByTick(this._instrumentAddress, this._expiry, tick, this._config, options);
    }

    /**
     * Inquire by signed base size for this pair.
     *
     * If this client is created with an API config and `rpcFallback` is provided, this will use the API by default
     * and fall back to RPC reads when the API request fails.
     */
    async inquire(signedSize: bigint, options?: ReadOptions): Promise<Quotation> {
        if (isApiConfig(this._config) && this._rpcFallback) {
            // Market API endpoints require an `ApiSigner`. When no signer is provided, skip the API path entirely and
            // use `rpcFallback` directly (otherwise we'd just throw and catch to reach the same result).
            if (!this._config.signer) {
                return inquireByBaseSize(this._instrumentAddress, this._expiry, signedSize, this._rpcFallback, options);
            }

            try {
                return await inquireByBaseSize(this._instrumentAddress, this._expiry, signedSize, this._config);
            } catch (apiError) {
                try {
                    return await inquireByBaseSize(this._instrumentAddress, this._expiry, signedSize, this._rpcFallback, options);
                } catch (rpcError) {
                    throw new AggregateError(
                        [apiError, rpcError],
                        'PerpClient.inquire failed: API request and rpcFallback request both failed'
                    );
                }
            }
        }

        return inquireByBaseSize(this._instrumentAddress, this._expiry, signedSize, this._config, options);
    }

    /**
     * Fetch order book for this pair.
     *
     * If this client is created with an API config and `rpcFallback` is provided, this will use the API by default
     * and fall back to RPC reads when the API request fails or returns null.
     * @param length - Optional order book depth (default: 10) - only used for RPC
     * @param options - Optional read options (blockNumber, blockTag) - only used for RPC config
     * @returns Order book data with bids/asks
     */
    async getOrderBook(length?: number, options?: ReadOptions) {
        if (isApiConfig(this._config) && this._rpcFallback) {
            // Market API endpoints require an `ApiSigner`. When no signer is provided, skip the API path entirely and
            // use `rpcFallback` directly (otherwise we'd just throw and catch to reach the same result).
            if (!this._config.signer) {
                return fetchOrderBook(this._instrumentAddress, this._expiry, this._rpcFallback, length, options);
            }

            let apiError: unknown;
            try {
                const apiResult = await fetchOrderBook(this._instrumentAddress, this._expiry, this._config);
                if (apiResult !== null) {
                    return apiResult;
                }
                apiError = new Error('API returned null orderBook');
            } catch (error) {
                apiError = error;
            }

            try {
                return await fetchOrderBook(this._instrumentAddress, this._expiry, this._rpcFallback, length, options);
            } catch (rpcError) {
                throw new AggregateError(
                    [apiError, rpcError],
                    'PerpClient.getOrderBook failed: API request and rpcFallback request both failed'
                );
            }
        }

        return fetchOrderBook(this._instrumentAddress, this._expiry, this._config, length, options);
    }

    // ============================================================================
    // WebSocket Subscriptions
    // ============================================================================

    /**
     * Subscribe to order book updates for this pair.
     * @param handler - Handler function for order book updates
     * @returns Unsubscribe function
     */
    subscribeOrderBook(handler: (data: OrderBookStreamData) => void): () => void {
        const subscription = this.wsManager.subscribeOrderBook(
            this.wsUrl,
            {
                chainId: this._config.chainId,
                instrument: this._instrumentAddress,
                expiry: this._expiry,
                type: 'orderBook',
            },
            handler,
            this.wsOptions
        );
        return () => subscription.unsubscribe();
    }

    /**
     * Subscribe to portfolio updates.
     * @param userAddress - User address to subscribe to
     * @param handler - Handler function for portfolio updates
     * @returns Unsubscribe function
     */
    subscribePortfolio(userAddress: Address, handler: (data: PortfolioStreamData) => void): () => void {
        const subscription = this.wsManager.subscribePortfolio(
            this.wsUrl,
            {
                chainId: this._config.chainId,
                userAddress,
                type: 'portfolio',
            },
            handler,
            this.wsOptions
        );
        return () => subscription.unsubscribe();
    }

    /**
     * Subscribe to instrument updates for this pair.
     * @param handler - Handler function for instrument updates
     * @returns Unsubscribe function
     */
    subscribeInstrument(handler: (data: InstrumentStreamData | MarketPairInfoChangedData) => void): () => void {
        const subscription = this.wsManager.subscribeInstrument(
            this.wsUrl,
            {
                chainId: this._config.chainId,
                instrument: this._instrumentAddress,
                expiry: this._expiry,
                type: 'instrument',
            },
            handler,
            this.wsOptions
        );
        return () => subscription.unsubscribe();
    }

    /**
     * Subscribe to trades updates for this pair.
     * @param handler - Handler function for trades updates. Receives trade data when trades occur.
     * @returns Unsubscribe function that can be called to stop receiving updates
     */
    subscribeTrades(handler: (data: TradesStreamData) => void): () => void {
        const pair = `${this._instrumentAddress.toLowerCase()}_${this._expiry}`;
        const subscription = this.wsManager.subscribeTrades(
            this.wsUrl,
            {
                chainId: this._config.chainId,
                pairs: [pair],
                type: 'trades',
            },
            handler,
            this.wsOptions
        );
        return () => subscription.unsubscribe();
    }
}
