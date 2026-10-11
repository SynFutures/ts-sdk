import {
    PublicWebsocketClient,
    type PublicWebsocketClientOptions,
    type OrderBookSubscribeParams,
    type PortfolioSubscribeParams,
    type InstrumentSubscribeParams,
    type OrderBookStreamData,
    type PortfolioStreamData,
    type InstrumentStreamData,
    type MarketPairInfoChangedData,
    type PublicWebsocketSubscription,
    type MmTradesSubscribeParams,
    type TradesStreamData,
} from './apis/websocket';

type StreamHandler<TPayload, TParams> = (payload: TPayload, context: { params: TParams }) => void;

/**
 * Singleton WebSocket manager that manages WebSocket connections.
 * Ensures only one WebSocket connection per URL, shared across all PerpClient instances.
 */
export class WebSocketManager {
    private static instance: WebSocketManager;
    private readonly clients: Map<string, PublicWebsocketClient> = new Map();

    private constructor() {
        // Private constructor for singleton pattern
    }

    /**
     * Get the singleton instance of WebSocketManager.
     */
    static getInstance(): WebSocketManager {
        if (!WebSocketManager.instance) {
            WebSocketManager.instance = new WebSocketManager();
        }
        return WebSocketManager.instance;
    }

    /**
     * Get or create a WebSocket client for the given URL.
     * If a client already exists for this URL, it is reused.
     */
    private getClient(url: string, options?: PublicWebsocketClientOptions): PublicWebsocketClient {
        if (!this.clients.has(url)) {
            const client = new PublicWebsocketClient({ ...options, url });
            this.clients.set(url, client);
        }
        return this.clients.get(url)!;
    }

    /**
     * Subscribe to order book updates.
     * @param url - WebSocket URL
     * @param params - Subscription parameters
     * @param handler - Handler function
     * @param options - Optional WebSocket client options
     * @returns Unsubscribe function
     */
    subscribeOrderBook(
        url: string,
        params: OrderBookSubscribeParams,
        handler: StreamHandler<OrderBookStreamData, OrderBookSubscribeParams>,
        options?: PublicWebsocketClientOptions
    ): PublicWebsocketSubscription {
        const client = this.getClient(url, options);
        return client.subscribeOrderBook(params, handler);
    }

    /**
     * Subscribe to portfolio updates.
     * @param url - WebSocket URL
     * @param params - Subscription parameters
     * @param handler - Handler function
     * @param options - Optional WebSocket client options
     * @returns Unsubscribe function
     */
    subscribePortfolio(
        url: string,
        params: PortfolioSubscribeParams,
        handler: StreamHandler<PortfolioStreamData, PortfolioSubscribeParams>,
        options?: PublicWebsocketClientOptions
    ): PublicWebsocketSubscription {
        const client = this.getClient(url, options);
        return client.subscribePortfolio(params, handler);
    }

    /**
     * Subscribe to instrument updates.
     * @param url - WebSocket URL
     * @param params - Subscription parameters
     * @param handler - Handler function
     * @param options - Optional WebSocket client options
     * @returns Unsubscribe function
     */
    subscribeInstrument(
        url: string,
        params: InstrumentSubscribeParams,
        handler: StreamHandler<InstrumentStreamData | MarketPairInfoChangedData, InstrumentSubscribeParams>,
        options?: PublicWebsocketClientOptions
    ): PublicWebsocketSubscription {
        const client = this.getClient(url, options);
        return client.subscribeInstrument(params, handler);
    }

    /**
     * Subscribe to trades updates.
     * @param url - WebSocket URL
     * @param params - Subscription parameters
     * @param handler - Handler function
     * @param options - Optional WebSocket client options
     * @returns Unsubscribe function
     */
    subscribeTrades(
        url: string,
        params: MmTradesSubscribeParams,
        handler: StreamHandler<TradesStreamData, MmTradesSubscribeParams>,
        options?: PublicWebsocketClientOptions
    ): PublicWebsocketSubscription {
        const client = this.getClient(url, options);
        return client.subscribeTrades(params, handler);
    }

    /**
     * Close a specific WebSocket connection.
     * @param wsUrl - WebSocket URL to close
     */
    closeConnection(wsUrl: string): void {
        const client = this.clients.get(wsUrl);
        if (client) {
            client.close();
            this.clients.delete(wsUrl);
        }
    }

    /**
     * Close all WebSocket connections.
     */
    closeAll(): void {
        for (const client of this.clients.values()) {
            client.close();
        }
        this.clients.clear();
    }
}
