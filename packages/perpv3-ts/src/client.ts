import { isAddressEqual, type Address } from 'viem';
import { PublicWebsocketClient } from './apis/websocket';
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
import { UserSetting, type PairSnapshot, type Quotation } from './types';
import { MarketMakerModule, MarketModule } from './apis';
import { HttpClient } from './utils/http';

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
    readonly websocket: PublicWebsocketClient;

    readonly mm?: MarketMakerModule;
    readonly market?: MarketModule;

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
            /**
             * Optional RPC config for falling back to onchain reads when API requests fail.
             * Only used when `config` is `ApiConfig`.
             */
            rpcFallback?: RpcConfig;
        } & (
            | { websocket?: PublicWebsocketClient; wsOptions?: never }
            | { websocket?: never; wsOptions?: PublicWebsocketClientOptions }
        )
    ) {
        this._config = config;
        this._userSetting = userSetting;
        this._instrumentAddress = instrumentAddress;
        this._expiry = expiry;
        this._rpcFallback = isApiConfig(this._config) ? options?.rpcFallback : undefined;
        if (isApiConfig(this._config) && this._rpcFallback && this._config.chainId !== this._rpcFallback.chainId) {
            throw new Error(
                `rpcFallback.chainId (${this._rpcFallback.chainId}) must match ApiConfig.chainId (${this._config.chainId})`
            );
        }
        this.websocket = options?.websocket ?? new PublicWebsocketClient(options?.wsOptions);
        if (isApiConfig(this._config)) {
            const client = new HttpClient(this._config);
            if (this._config.authInfo) {
                this.mm = new MarketMakerModule(client, this._config.authInfo);
            }
            if (this._config.signer) {
                this.market = new MarketModule(client, this._config.signer);
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
     * Check if this client is scoped to a specific pair.
     */
    isForPair(instrumentAddress: Address, expiry: number): boolean {
        return this._expiry === expiry && isAddressEqual(this._instrumentAddress, instrumentAddress);
    }

    // ============================================================================
    // Query Methods
    // ============================================================================

    private async query<T>(
        name: string,
        options: ReadOptions | undefined,
        read: (config: ApiConfig | RpcConfig) => Promise<T>
    ): Promise<T> {
        const rpc = this._rpcFallback;
        if (!isApiConfig(this._config) || !rpc) return read(this._config);
        if (!this._config.signer || options?.blockNumber !== undefined || options?.blockTag !== undefined)
            return read(rpc);
        let apiError: unknown;
        try {
            const result = await read(this._config);
            if (result !== null) return result;
            apiError = new Error('API returned null orderBook');
        } catch (error) {
            apiError = error;
        }
        try {
            return await read(rpc);
        } catch (error) {
            throw new AggregateError(
                [apiError, error],
                `PerpClient.${name} failed: API request and rpcFallback request both failed`,
                { cause: error }
            );
        }
    }

    getSnapshot(traderAddress?: Address, signedSize?: bigint, options?: ReadOptions): Promise<PairSnapshot> {
        return this.query('getSnapshot', options, (config) =>
            fetchOnchainContext(this.instrumentAddress, this.expiry, config, traderAddress, signedSize, options)
        );
    }

    getQuotation(tick: number, options?: ReadOptions): Promise<{ size: bigint; quotation: Quotation }> {
        return this.query('getQuotation', options, (config) =>
            inquireByTick(this.instrumentAddress, this.expiry, tick, config, options)
        );
    }

    inquire(signedSize: bigint, options?: ReadOptions): Promise<Quotation> {
        return this.query('inquire', options, (config) =>
            inquireByBaseSize(this.instrumentAddress, this.expiry, signedSize, config, options)
        );
    }

    getOrderBook(length?: number, options?: ReadOptions) {
        return this.query('getOrderBook', options, (config) =>
            fetchOrderBook(this.instrumentAddress, this.expiry, config, length, options)
        );
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
        const subscription = this.websocket.subscribeOrderBook(
            {
                chainId: this._config.chainId,
                instrument: this._instrumentAddress,
                expiry: this._expiry,
                type: 'orderBook',
            },
            handler
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
        const subscription = this.websocket.subscribePortfolio(
            {
                chainId: this._config.chainId,
                userAddress,
                type: 'portfolio',
            },
            handler
        );
        return () => subscription.unsubscribe();
    }

    /**
     * Subscribe to instrument updates for this pair.
     * @param handler - Handler function for instrument updates
     * @returns Unsubscribe function
     */
    subscribeInstrument(handler: (data: InstrumentStreamData | MarketPairInfoChangedData) => void): () => void {
        const subscription = this.websocket.subscribeInstrument(
            {
                chainId: this._config.chainId,
                instrument: this._instrumentAddress,
                expiry: this._expiry,
                type: 'instrument',
            },
            handler
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
        const subscription = this.websocket.subscribeTrades(
            {
                chainId: this._config.chainId,
                pairs: [pair],
                type: 'trades',
            },
            handler
        );
        return () => subscription.unsubscribe();
    }
}
