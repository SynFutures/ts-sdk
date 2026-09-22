import type { Address } from 'viem';
import { DEFAULT_PUBLIC_WS_URL } from './constants';
import {
    attachWebSocketListener,
    buildWebSocketHeaders,
    createWebSocket,
    extractWebSocketMessageText,
    normalizeWebSocketCloseEvent,
    WS_READY_STATE,
    type WebSocketFactory,
    type WebSocketLike,
} from './websocket/transport';
import {
    buildPublicWsRequest,
    buildWsRequestParams,
    wsTopicKey,
    wsTopics,
    buildWsRequestResultEvent,
    isPublicWsAckMessage,
    isPublicWsStreamMessage,
    type PendingPublicWsRequest,
    type PublicWsAckMessage,
    type PublicWsRequestMethod,
    type PublicWsRequestResultEvent,
    type PublicWsStreamMetadata,
    type PublicWsWireMessage,
    type PublicWsWireStreamMessage,
} from './websocket/protocol';
import {
    mergeStreamMetadata,
    normalizeCommonStreamData,
    normalizeInstrumentBasicInfoStreamData,
    normalizeInstrumentStreamData,
    normalizeKlineStreamData,
    normalizeOptionalNumber,
    normalizeOrderBookStream,
    normalizePortfolioStreamData,
    normalizeTradesStreamData,
} from './websocket/normalizers';
import {
    PublicWsSubscriptionRegistry,
    type RawSubscriptionRecord,
    type StreamHandler,
    type TradesSubscriptionRecord,
} from './websocket/subscriptions';
import type { BlockInfo } from '../types';

export type {
    PublicWsAckMessage,
    PublicWsRequestMethod,
    PublicWsRequestResultEvent,
    PublicWsStreamMetadata,
    PublicWsWireMessage,
    PublicWsWireStreamMessage,
} from './websocket/protocol';

// ---------------------------------------------------------------------------
// Stream payloads
// ---------------------------------------------------------------------------

export type GenericStreamData = Record<string, unknown>;

export type OrderBookStreamData = {
    chainId: number;
    instrument: Address;
    expiry: number | string;
    depths: Record<string, OrderBookDepth>;
};

export type PortfolioStreamType = 'order' | 'range' | 'position' | 'gate';
export type PortfolioOrderInfo = {
    /**
     * Packed order key (tick + nonce) for limit orders (decimal string from WS).
     */
    oid?: string;
    /**
     * Client order ID (used for /orderId API).
     */
    orderId?: string;
    /**
     * Order update type (e.g. 'placed', 'canceled').
     */
    type?: string;
};
export type PortfolioStreamData = {
    chainId?: number;
    userAddress: Address;
    instrument?: Address;
    expiry?: number | string;
    type: PortfolioStreamType;
    orderInfo?: PortfolioOrderInfo;
};

export type KlineStreamData = {
    chainId: number;
    instrument: Address;
    expiry: number | string;
    interval: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    baseVolume?: number;
    quoteVolume?: number;
    volumeUSD?: number;
    timestamp?: number;
    startTime?: number;
    endTime?: number;
};

export type InstrumentStreamData = {
    chainId: number;
    instrument: Address;
    symbol?: string;
    expiry: number | string;
    markPrice?: string;
    fairPrice?: string;
};

export type InstrumentBasicInfoStreamData = {
    chainId: number;
    instrument: Address;
    expiry: number | string;
    symbol?: string;
};

export type MarketPairInfoChangedData = InstrumentStreamData;

export type MarketListItem = {
    instrumentAddr?: Address;
    expiry?: number | string;
    symbol?: string;
    fairPrice?: string;
    markPrice?: string;
    baseToken?: Record<string, unknown>;
    quoteToken?: Record<string, unknown>;
    fairPriceChange24h?: string;
    baseVolume24h?: string;
    openInterests?: string;
    tvl?: string;
    volume24hUsd?: string;
    tvlUsd?: string;
    openInterestsUsd?: string;
    longOi?: string;
    shortOi?: string;
    periods1hFunding?: Record<string, unknown>;
    last1hFunding?: Record<string, unknown>;
    fundingRatePerHour?: string;
    quoteVolume24h?: string;
    fullSymbol?: string;
    updateTime?: number;
    marketType?: string;
    poolFee24h?: string;
    maxLeverage?: number;
    spotPrice?: string;
    condition?: number;
    ammStatus?: number;
};

export type MarketListChangedData = {
    chainId: number;
    data: MarketListItem[];
};

export type BlockNumChangedData = {
    chainId: number;
    blockNum: number;
    blockTime?: number;
};

export type TradesTokenInfo = {
    address: string;
    symbol: string;
    decimals: number;
    image: string;
    price: number;
};

export type TradesStreamData = {
    chainId: number;
    instrument: Address;
    expiry: number;
    data: TradeItem[];
};

export type TradeItem = {
    id: string;
    chainId: number;
    instrument: Address;
    instrumentAddress: Address;
    expiry: number;
    size: string;
    balance: string;
    price: string;
    tradeFee: string;
    protocolFee: string;
    timestamp: number;
    txHash: string;
    type: string;
    symbol: string;
    baseToken: TradesTokenInfo;
    quoteToken: TradesTokenInfo;
    typeString: string;
    side: string;
    event: string;
    markPrice: string;
    fairPrice: string;
};

// ---------------------------------------------------------------------------
// Stream messages
// ---------------------------------------------------------------------------

type BaseStreamMetadata = PublicWsStreamMetadata;

type OrderBookStreamMessage = BaseStreamMetadata & {
    stream: 'orderBook';
    data: OrderBookStreamData;
};

type PortfolioStreamMessage = BaseStreamMetadata & {
    stream: 'portfolio';
    data: PortfolioStreamData;
};

type KlineStreamMessage = BaseStreamMetadata & {
    stream: 'kline';
    data: KlineStreamData;
};

type InstrumentStreamMessage = BaseStreamMetadata & {
    stream: 'instrument';
    data: InstrumentStreamData;
};

type InstrumentBasicInfoStreamMessage = BaseStreamMetadata & {
    stream: 'instrumentBasicInfo';
    data: InstrumentBasicInfoStreamData;
};

type MarketPairInfoChangedStreamMessage = BaseStreamMetadata & {
    stream: 'marketPairInfoChanged';
    data: MarketPairInfoChangedData;
};

type MarketListChangedStreamMessage = BaseStreamMetadata & {
    stream: 'marketListChanged';
    data: MarketListItem[];
};

type BlockNumChangedStreamMessage = BaseStreamMetadata & {
    stream: 'blockNumChanged';
    data: BlockNumChangedData;
};

type TradesStreamMessage = BaseStreamMetadata & {
    stream: 'trades';
    data: unknown[];
};

type RawStreamMessage = BaseStreamMetadata & {
    stream: string;
    data: GenericStreamData;
};

type KnownStreamMessage =
    | OrderBookStreamMessage
    | PortfolioStreamMessage
    | KlineStreamMessage
    | InstrumentStreamMessage
    | InstrumentBasicInfoStreamMessage
    | MarketPairInfoChangedStreamMessage
    | MarketListChangedStreamMessage
    | BlockNumChangedStreamMessage
    | TradesStreamMessage;

export type PublicStreamMessage = KnownStreamMessage | RawStreamMessage;

// ---------------------------------------------------------------------------
// Subscribe params
// ---------------------------------------------------------------------------

export interface OrderBookSubscribeParams {
    chainId: number;
    instrument: Address;
    expiry: number;
    type: 'orderBook';
}

export interface MmTradesSubscribeParams {
    chainId: number;
    /**
     * The pairs to subscribe to.
     * Example: ['pair_expiry', 'pair2_expiry']
     */
    pairs: string[];
    type: 'trades';
}

export interface MmOrderBookSubscribeParams {
    chainId: number;
    instrument: Address;
    expiry: number;
    depth?: number;
    type: 'orderBook';
}

export interface PortfolioSubscribeParams {
    chainId: number;
    /**
     * Trader address (portfolio owner) to subscribe to.
     * Note: this is the on-chain beneficiary/owner address, not necessarily the tx sender.
     */
    userAddress: Address;
    type: 'portfolio';
}

export interface KlineSubscribeParams {
    chainId: number;
    instrument: Address;
    expiry: number;
    interval: string;
    type: 'kline';
}

export interface InstrumentSubscribeParams {
    chainId: number;
    instrument: Address;
    expiry: number;
    type: 'instrument';
}

export interface InstrumentBasicInfoSubscribeParams {
    chainId: number;
    instrument: Address;
    expiry: number;
    type: 'instrumentBasicInfo';
}

export interface CommonSubscribeParams {
    chainId: number;
    type: 'common';
}

export interface RawSubscribeParams {
    type: string;
    chainId?: number;
    instrument?: Address;
    expiry?: number | string;
    params?: Record<string, unknown>;
}

export type PublicWsSubscribeParams =
    | OrderBookSubscribeParams
    | MmOrderBookSubscribeParams
    | MmTradesSubscribeParams
    | PortfolioSubscribeParams
    | KlineSubscribeParams
    | InstrumentSubscribeParams
    | InstrumentBasicInfoSubscribeParams
    | CommonSubscribeParams
    | RawSubscribeParams;

// ---------------------------------------------------------------------------
// Order book helpers
// ---------------------------------------------------------------------------

export interface OrderBookLevel {
    tick: number;
    price: string;
    baseSize: string;
    quoteSize: string;
    baseSum: string;
    quoteSum: string;
}

export interface OrderBookDepth {
    blockInfo?: BlockInfo;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export type InvalidStreamDataEvent = {
    stream: string;
    message: PublicWsWireStreamMessage;
    merged: GenericStreamData;
};

export interface PublicWebsocketClientOptions {
    url?: string;
    headers?: Record<string, string>;
    wsFactory?: WebSocketFactory;
    autoReconnect?: boolean;
    reconnectDelayMs?: number;
    pingIntervalMs?: number;
    maxReconnectAttempts?: number;
    /**
     * Called with every parsed WS message (wire): stream payloads and request ACKs.
     */
    onMessage?: (message: PublicWsWireMessage) => void;
    /**
     * Called with request ACKs like `{ id, result }` for SUBSCRIBE/UNSUBSCRIBE requests.
     */
    onRequestResult?: (event: PublicWsRequestResultEvent) => void;
    onError?: (error: unknown) => void;
    /**
     * Called when a stream payload fails validation and is dropped for typed subscribers.
     * Raw subscribers still receive the merged payload.
     */
    onInvalidStreamData?: (event: InvalidStreamDataEvent) => void;
    onReconnectFailed?: (attempts: number) => void;
    onDisconnect?: (event?: { code?: number; reason?: string }) => void;
}

export interface PublicWebsocketSubscription {
    unsubscribe: () => void;
}

/**
 * Public WebSocket client for SynFutures public streams.
 * Supports orderBook, portfolio, trades, kline, instrument (incl. marketPairInfoChanged),
 * instrumentBasicInfo, common (blockNumChanged/marketListChanged), and raw fallback.
 */
export class PublicWebsocketClient {
    private readonly url: string;
    private readonly headers: Record<string, string>;
    private readonly wsFactory?: WebSocketFactory;
    private readonly autoReconnect: boolean;
    private readonly reconnectDelayMs: number;
    private readonly pingIntervalMs: number;
    private readonly onMessage?: (message: PublicWsWireMessage) => void;
    private readonly onRequestResult?: (event: PublicWsRequestResultEvent) => void;
    private readonly onError?: (error: unknown) => void;
    private readonly onInvalidStreamData?: (event: InvalidStreamDataEvent) => void;
    private readonly onReconnectFailed?: (attempts: number) => void;
    private readonly onDisconnect?: (event?: { code?: number; reason?: string }) => void;
    private readonly maxReconnectAttempts: number;

    private readonly pendingRequests = new Map<number, PendingPublicWsRequest>();

    private socket: WebSocketLike | null = null;
    private pingTimer?: ReturnType<typeof setInterval>;
    private reconnectTimer?: ReturnType<typeof setTimeout>;
    private nextRequestId = 1;
    private manuallyClosed = false;
    private reconnectAttempts = 0;
    private readonly subscriptions = new PublicWsSubscriptionRegistry();

    private readonly activeTopics = new Set<string>();

    constructor(options?: PublicWebsocketClientOptions) {
        this.url = options?.url ?? DEFAULT_PUBLIC_WS_URL;
        this.headers = buildWebSocketHeaders(this.url, options?.headers);
        this.wsFactory = options?.wsFactory;
        this.autoReconnect = options?.autoReconnect ?? true;
        this.reconnectDelayMs = options?.reconnectDelayMs ?? 1_000;
        this.pingIntervalMs = options?.pingIntervalMs ?? 30_000;
        this.onMessage = options?.onMessage;
        this.onRequestResult = options?.onRequestResult;
        this.onError = options?.onError;
        this.onInvalidStreamData = options?.onInvalidStreamData;
        this.onReconnectFailed = options?.onReconnectFailed;
        this.onDisconnect = options?.onDisconnect;
        this.maxReconnectAttempts =
            options?.maxReconnectAttempts !== undefined
                ? options.maxReconnectAttempts
                : options?.reconnectDelayMs !== undefined
                  ? Number.POSITIVE_INFINITY
                  : 10;
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    public connect(): void {
        if (
            this.socket &&
            (this.socket.readyState === WS_READY_STATE.CONNECTING || this.socket.readyState === WS_READY_STATE.OPEN)
        ) {
            return;
        }

        this.manuallyClosed = false;
        const socket = createWebSocket(this.url, this.headers, this.wsFactory);
        this.socket = socket;

        attachWebSocketListener(socket, 'open', () => {
            if (this.socket === socket) this.handleOpen();
        });
        attachWebSocketListener(socket, 'message', (event: unknown) => {
            if (this.socket === socket) this.handleIncomingMessage(event);
        });
        attachWebSocketListener(socket, 'error', (event: unknown) => {
            if (this.socket === socket) this.onError?.(event);
        });
        attachWebSocketListener(socket, 'close', (event: unknown) => {
            if (this.socket === socket) this.handleClose(normalizeWebSocketCloseEvent(event));
        });
    }

    public close(): void {
        this.manuallyClosed = true;
        this.clearTimers();
        this.pendingRequests.clear();
        const socket = this.socket;
        this.socket = null;
        this.activeTopics.clear();
        socket?.close();
        this.reconnectAttempts = 0;
        if (socket) this.onDisconnect?.();
    }

    // -----------------------------------------------------------------------
    // Subscribe helpers
    // -----------------------------------------------------------------------

    public subscribeOrderBook(
        params: OrderBookSubscribeParams | MmOrderBookSubscribeParams,
        handler: StreamHandler<OrderBookStreamData, OrderBookSubscribeParams | MmOrderBookSubscribeParams>
    ): PublicWebsocketSubscription {
        const record = this.subscriptions.addOrderBook(params, handler);
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeOrderBook(record.id) };
    }

    public subscribePortfolio(
        params: PortfolioSubscribeParams,
        handler: StreamHandler<PortfolioStreamData, PortfolioSubscribeParams>
    ): PublicWebsocketSubscription {
        const record = this.subscriptions.addPortfolio(params, handler);
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribePortfolio(record.id) };
    }

    public subscribeKline(
        params: KlineSubscribeParams,
        handler: StreamHandler<KlineStreamData, KlineSubscribeParams>
    ): PublicWebsocketSubscription {
        const record = this.subscriptions.addKline(params, handler);
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeKline(record.id) };
    }

    public subscribeInstrument(
        params: InstrumentSubscribeParams,
        handler: StreamHandler<InstrumentStreamData | MarketPairInfoChangedData, InstrumentSubscribeParams>
    ): PublicWebsocketSubscription {
        const record = this.subscriptions.addInstrument(params, handler);
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeInstrument(record.id) };
    }

    public subscribeInstrumentBasicInfo(
        params: InstrumentBasicInfoSubscribeParams,
        handler: StreamHandler<InstrumentBasicInfoStreamData, InstrumentBasicInfoSubscribeParams>
    ): PublicWebsocketSubscription {
        const record = this.subscriptions.addInstrumentBasicInfo(params, handler);
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeInstrumentBasicInfo(record.id) };
    }

    public subscribeCommon(
        params: CommonSubscribeParams,
        handler: StreamHandler<MarketListChangedData | BlockNumChangedData, CommonSubscribeParams>
    ): PublicWebsocketSubscription {
        const record = this.subscriptions.addCommon(params, handler);
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeCommon(record.id) };
    }

    public subscribeRaw(
        params: RawSubscribeParams,
        handler: StreamHandler<GenericStreamData, RawSubscribeParams>,
        streams?: string | string[]
    ): PublicWebsocketSubscription {
        const record = this.subscriptions.addRaw(params, handler, streams);
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeRaw(record.id) };
    }

    public subscribeTrades(
        params: MmTradesSubscribeParams,
        handler: StreamHandler<TradesStreamData, MmTradesSubscribeParams>
    ): PublicWebsocketSubscription {
        if (!params.pairs?.length) {
            throw new Error('Trades subscription requires a non-empty `pairs` array.');
        }
        const record = this.subscriptions.addTrades(params, handler);
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeTrades(record.id) };
    }

    // -----------------------------------------------------------------------
    // Unsubscribe helpers
    // -----------------------------------------------------------------------

    private unsubscribeOrderBook(id: number): void {
        const record = this.subscriptions.removeOrderBook(id);
        if (!record) return;
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribePortfolio(id: number): void {
        const record = this.subscriptions.removePortfolio(id);
        if (!record) return;
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeTrades(id: number): void {
        const record = this.subscriptions.removeTrades(id);
        if (!record) return;
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeKline(id: number): void {
        const record = this.subscriptions.removeKline(id);
        if (!record) return;
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeInstrument(id: number): void {
        const record = this.subscriptions.removeInstrument(id);
        if (!record) return;
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeInstrumentBasicInfo(id: number): void {
        const record = this.subscriptions.removeInstrumentBasicInfo(id);
        if (!record) return;
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeCommon(id: number): void {
        const record = this.subscriptions.removeCommon(id);
        if (!record) return;
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeRaw(id: number): void {
        const record = this.subscriptions.removeRaw(id);
        if (!record) return;
        this.sendUnsubscribeIfOpen(record.params);
    }

    // -----------------------------------------------------------------------
    // Connection internals
    // -----------------------------------------------------------------------

    private handleOpen(): void {
        this.startPing();
        this.resubscribeAll();
        this.reconnectAttempts = 0;
    }

    private handleClose(event?: { code?: number; reason?: string }): void {
        this.clearTimers();
        this.socket = null;
        this.activeTopics.clear();
        this.pendingRequests.clear();

        this.onDisconnect?.(event);

        if (this.manuallyClosed || !this.autoReconnect) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.onReconnectFailed?.(this.reconnectAttempts);
            return;
        }

        const delay = Math.min(this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts), 30_000);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
        this.reconnectAttempts++;
    }

    private startPing(): void {
        if (this.pingIntervalMs <= 0) return;
        this.pingTimer = setInterval(() => this.sendRaw('ping'), this.pingIntervalMs);
    }

    private clearTimers(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = undefined;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }

    private resubscribeAll(): void {
        for (const params of this.subscriptions.params()) this.sendSubscribeIfOpen(params);
    }

    private sendSubscribeIfOpen(params: object): void {
        this.updateWireTopics('SUBSCRIBE', params, (key) => !this.activeTopics.has(key));
    }

    private sendUnsubscribeIfOpen(params: object): void {
        const retained = new Set([...this.subscriptions.params()].flatMap(wsTopics).map(wsTopicKey));
        this.updateWireTopics('UNSUBSCRIBE', params, (key) => this.activeTopics.has(key) && !retained.has(key));
    }

    private updateWireTopics(method: PublicWsRequestMethod, params: object, include: (key: string) => boolean): void {
        if (this.socket?.readyState !== WS_READY_STATE.OPEN) return;
        const topics = wsTopics(params).filter((topic) => {
            const key = wsTopicKey(topic);
            if (!include(key)) return false;
            if (method === 'SUBSCRIBE') this.activeTopics.add(key);
            else this.activeTopics.delete(key);
            return true;
        });
        if (!topics.length) return;
        const wire = buildWsRequestParams(params);
        if (Array.isArray(wire.pairs)) wire.pairs = topics.flatMap((topic) => topic.pairs as string[]);
        this.sendRequest(method, wire);
    }

    private sendRequest(method: PublicWsRequestMethod, params: object): void {
        const id = this.nextRequestId++;
        const request = buildPublicWsRequest(id, method, params);
        this.pendingRequests.set(id, { method, params: request.params, sentAtMs: Date.now() });
        this.sendRaw(JSON.stringify(request));
    }

    private sendRaw(payload: string): void {
        if (this.socket?.readyState === WS_READY_STATE.OPEN) {
            this.socket.send(payload);
        }
    }

    // -----------------------------------------------------------------------
    // Message handling
    // -----------------------------------------------------------------------

    private handleIncomingMessage(event: unknown): void {
        const text = extractWebSocketMessageText(event);
        if (!text || text === 'pong') return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return;
        }

        if (isPublicWsAckMessage(parsed)) {
            this.onMessage?.(parsed);
            this.handleWsAckMessage(parsed);
            return;
        }

        if (!isPublicWsStreamMessage(parsed)) return;
        this.onMessage?.(parsed);

        const message = parsed;

        const merged = mergeStreamMetadata(message);

        switch (message.stream) {
            case 'orderBook': {
                this.notifyRawSubscribers(message.stream, merged);
                const normalized = normalizeOrderBookStream(merged);
                if (normalized) {
                    this.notifyOrderBookSubscribers(normalized);
                } else {
                    this.reportInvalidStreamData(message, merged);
                }
                break;
            }
            case 'portfolio': {
                const normalized = normalizePortfolioStreamData(merged);
                if (normalized) {
                    this.notifyPortfolioSubscribers(normalized);
                } else {
                    this.reportInvalidStreamData(message, merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            }
            case 'kline': {
                const normalized = normalizeKlineStreamData(merged);
                if (normalized) {
                    this.notifyKlineSubscribers(normalized);
                } else {
                    this.reportInvalidStreamData(message, merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            }
            case 'instrument': {
                const normalized = normalizeInstrumentStreamData(merged);
                if (normalized) {
                    this.notifyInstrumentSubscribers(normalized);
                } else {
                    this.reportInvalidStreamData(message, merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            }
            case 'instrumentBasicInfo': {
                const normalized = normalizeInstrumentBasicInfoStreamData(merged);
                if (normalized) {
                    this.notifyInstrumentBasicInfoSubscribers(normalized);
                } else {
                    this.reportInvalidStreamData(message, merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            }
            case 'marketPairInfoChanged': {
                const normalized = normalizeInstrumentStreamData(merged);
                if (normalized) {
                    this.notifyInstrumentSubscribers(normalized);
                } else {
                    this.reportInvalidStreamData(message, merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            }
            case 'marketListChanged':
                if (!this.notifyCommonSubscribers(merged, message.stream)) {
                    this.reportInvalidStreamData(message, merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'blockNumChanged':
                if (!this.notifyCommonSubscribers(merged, message.stream)) {
                    this.reportInvalidStreamData(message, merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'trades': {
                const normalized = normalizeTradesStreamData(merged);
                if (normalized) {
                    this.notifyTradesSubscribers(normalized);
                } else {
                    this.reportInvalidStreamData(message, merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            }
            default:
                this.notifyRawSubscribers(message.stream, merged);
                break;
        }
    }

    private reportInvalidStreamData(message: PublicWsWireStreamMessage, merged: GenericStreamData): void {
        this.onInvalidStreamData?.({ stream: message.stream, message, merged });
    }

    private notifyOrderBookSubscribers(data: OrderBookStreamData): void {
        for (const record of this.subscriptions.orderBooks()) {
            if (this.orderBookMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyPortfolioSubscribers(data: PortfolioStreamData): void {
        for (const record of this.subscriptions.portfolios()) {
            if (this.portfolioMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyKlineSubscribers(data: KlineStreamData): void {
        for (const record of this.subscriptions.klines()) {
            if (this.klineMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyInstrumentSubscribers(data: InstrumentStreamData | MarketPairInfoChangedData): void {
        for (const record of this.subscriptions.instruments()) {
            if (this.instrumentMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyInstrumentBasicInfoSubscribers(data: InstrumentBasicInfoStreamData): void {
        for (const record of this.subscriptions.instrumentBasicInfos()) {
            if (this.instrumentBasicInfoMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyCommonSubscribers(data: GenericStreamData, stream: string): boolean {
        let matchedSubscription = false;
        let delivered = false;

        for (const record of this.subscriptions.commons()) {
            if (this.commonMatches(record.params, data, stream)) {
                matchedSubscription = true;
                const normalized = normalizeCommonStreamData(data, stream, record.params);
                if (normalized) {
                    record.handler(normalized, { params: record.params });
                    delivered = true;
                }
            }
        }

        return !matchedSubscription || delivered;
    }

    private notifyRawSubscribers(stream: string, data: GenericStreamData): void {
        for (const record of this.subscriptions.raws()) {
            if (this.rawMatches(stream, record, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyTradesSubscribers(data: TradesStreamData): void {
        for (const record of this.subscriptions.trades()) {
            if (this.tradesMatches(record, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private handleWsAckMessage(message: PublicWsAckMessage): void {
        const request = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);
        const event = buildWsRequestResultEvent(message, request);

        this.onRequestResult?.(event);
    }

    // -----------------------------------------------------------------------
    // Matching
    // -----------------------------------------------------------------------

    private orderBookMatches(
        params: OrderBookSubscribeParams | MmOrderBookSubscribeParams,
        data: OrderBookStreamData
    ): boolean {
        const chainId = normalizeOptionalNumber(data.chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;

        const dataInstrument = data.instrument?.toLowerCase();
        if (dataInstrument && dataInstrument !== params.instrument.toLowerCase()) return false;

        const expiry = normalizeOptionalNumber(data.expiry);
        if (expiry !== undefined && expiry !== params.expiry) return false;

        return true;
    }

    private portfolioMatches(params: PortfolioSubscribeParams, data: PortfolioStreamData): boolean {
        const chainId = normalizeOptionalNumber(data.chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;
        if (data.userAddress?.toLowerCase() !== params.userAddress.toLowerCase()) return false;
        return true;
    }

    private klineMatches(params: KlineSubscribeParams, data: KlineStreamData): boolean {
        const chainId = normalizeOptionalNumber(data.chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;

        const dataInstrument = typeof data.instrument === 'string' ? data.instrument.toLowerCase() : undefined;
        if (dataInstrument && dataInstrument !== params.instrument.toLowerCase()) return false;

        const expiry = normalizeOptionalNumber(data.expiry);
        if (expiry !== undefined && expiry !== params.expiry) return false;

        const interval = (data as { interval?: string }).interval;
        if (interval && interval !== params.interval) return false;

        return true;
    }

    private instrumentMatches(
        params: InstrumentSubscribeParams,
        data: InstrumentStreamData | MarketPairInfoChangedData
    ): boolean {
        const chainId = normalizeOptionalNumber((data as { chainId?: number }).chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;

        const dataInstrument = data.instrument?.toLowerCase();
        if (dataInstrument && dataInstrument !== params.instrument.toLowerCase()) return false;

        const expiry = normalizeOptionalNumber((data as { expiry?: number | string }).expiry);
        const expectedExpiry = normalizeOptionalNumber(params.expiry);
        if (expectedExpiry !== undefined && expiry !== undefined && expectedExpiry !== expiry) return false;

        return true;
    }

    private instrumentBasicInfoMatches(
        params: InstrumentBasicInfoSubscribeParams,
        data: InstrumentBasicInfoStreamData
    ): boolean {
        const chainId = normalizeOptionalNumber(data.chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;

        const dataInstrument = data.instrument?.toLowerCase();
        if (dataInstrument && dataInstrument !== params.instrument.toLowerCase()) return false;

        const expiry = normalizeOptionalNumber(data.expiry);
        if (expiry !== undefined && expiry !== params.expiry) return false;

        return true;
    }

    private commonMatches(params: CommonSubscribeParams, data: GenericStreamData, stream: string): boolean {
        const chainId = normalizeOptionalNumber((data as { chainId?: number }).chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;
        // For now accept both blockNumChanged and marketListChanged under common.
        return stream === 'blockNumChanged' || stream === 'marketListChanged';
    }

    private rawMatches(stream: string, record: RawSubscriptionRecord, data: GenericStreamData): boolean {
        if (!record.streams.includes(stream)) return false;

        const expectedChainId = normalizeOptionalNumber(record.params.chainId);
        const dataChainId = normalizeOptionalNumber((data as { chainId?: number }).chainId);
        if (expectedChainId !== undefined && dataChainId !== undefined && expectedChainId !== dataChainId) return false;

        const expectedInstrument = record.params.instrument;
        const dataInstrument = (data as { instrument?: Address }).instrument;
        const normalizedDataInstrument = typeof dataInstrument === 'string' ? dataInstrument.toLowerCase() : undefined;
        if (
            expectedInstrument &&
            normalizedDataInstrument &&
            expectedInstrument.toLowerCase() !== normalizedDataInstrument
        ) {
            return false;
        }

        const expectedExpiry = normalizeOptionalNumber(record.params.expiry);
        const dataExpiry = normalizeOptionalNumber((data as { expiry?: number | string }).expiry);
        if (expectedExpiry !== undefined && dataExpiry !== undefined && expectedExpiry !== dataExpiry) return false;

        return true;
    }

    private tradesMatches(record: TradesSubscriptionRecord, data: TradesStreamData): boolean {
        if (data.chainId !== record.params.chainId) return false;

        const instrument = data.instrument.toLowerCase();
        const pair = `${instrument}_${data.expiry}`;
        return record.pairSet.has(pair);
    }
}
