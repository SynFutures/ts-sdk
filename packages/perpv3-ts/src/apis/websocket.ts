import type { Address } from 'viem';
import { DEFAULT_PUBLIC_WS_URL } from './constants';
import type { BlockInfo } from '../types';

type WebSocketFactory = (url: string, options?: { headers?: Record<string, string> }) => WebSocketLike;
type WebSocketCtor = new (
    url: string,
    protocols?: string | string[] | Record<string, unknown>,
    options?: Record<string, unknown>
) => WebSocketLike;

interface WebSocketLike {
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener?: (event: string, handler: (...args: any[]) => void) => void;
    removeEventListener?: (event: string, handler: (...args: any[]) => void) => void;
    on?: (event: string, handler: (...args: any[]) => void) => void;
}

type StreamHandler<TPayload, TParams> = (payload: TPayload, context: { params: TParams }) => void;

interface SubscriptionRecord<TParams, TPayload> {
    id: number;
    params: TParams;
    handler: StreamHandler<TPayload, TParams>;
}

interface RawSubscriptionRecord extends SubscriptionRecord<RawSubscribeParams, GenericStreamData> {
    streams: string[];
}

interface TradesSubscriptionRecord extends SubscriptionRecord<MmTradesSubscribeParams, TradesStreamData> {
    pairSet: Set<string>;
}

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const WS_READY_STATE = {
    CONNECTING: 0,
    OPEN: 1,
};

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
export type PortfolioStreamData = {
    chainId?: number;
    userAddress: Address;
    instrument?: Address;
    expiry?: number | string;
    type: PortfolioStreamType;
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

export type PublicWsStreamMetadata = {
    chainId?: number;
    instrument?: Address;
    expiry?: number | string;
};

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
// Wire messages (stream + ACK)
// ---------------------------------------------------------------------------

export type PublicWsRequestMethod = 'SUBSCRIBE' | 'UNSUBSCRIBE';

export type PublicWsAckMessage = {
    id: number;
    result: string;
};

export type PublicWsWireStreamMessage = BaseStreamMetadata & {
    stream: string;
    data?: unknown;
};

export type PublicWsWireMessage = PublicWsWireStreamMessage | PublicWsAckMessage;

export type PublicWsRequestResultEvent = {
    id: number;
    result: string;
    ok: boolean;
    method?: PublicWsRequestMethod;
    params?: Record<string, unknown>;
    sentAtMs?: number;
    receivedAtMs: number;
    latencyMs?: number;
};

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

    private readonly pendingRequests = new Map<
        number,
        { method: PublicWsRequestMethod; params: Record<string, unknown>; sentAtMs: number }
    >();

    private socket: WebSocketLike | null = null;
    private pingTimer?: ReturnType<typeof setInterval>;
    private reconnectTimer?: ReturnType<typeof setTimeout>;
    private nextRequestId = 1;
    private nextSubscriptionId = 1;
    private manuallyClosed = false;
    private reconnectAttempts = 0;

    private readonly orderBookSubscriptions = new Map<
        number,
        SubscriptionRecord<OrderBookSubscribeParams | MmOrderBookSubscribeParams, OrderBookStreamData>
    >();
    private readonly portfolioSubscriptions = new Map<
        number,
        SubscriptionRecord<PortfolioSubscribeParams, PortfolioStreamData>
    >();
    private readonly tradesSubscriptions = new Map<number, TradesSubscriptionRecord>();
    private readonly klineSubscriptions = new Map<number, SubscriptionRecord<KlineSubscribeParams, KlineStreamData>>();
    private readonly instrumentSubscriptions = new Map<
        number,
        SubscriptionRecord<InstrumentSubscribeParams, InstrumentStreamData | MarketPairInfoChangedData>
    >();
    private readonly instrumentBasicInfoSubscriptions = new Map<
        number,
        SubscriptionRecord<InstrumentBasicInfoSubscribeParams, InstrumentBasicInfoStreamData>
    >();
    private readonly commonSubscriptions = new Map<
        number,
        SubscriptionRecord<CommonSubscribeParams, MarketListChangedData | BlockNumChangedData>
    >();
    private readonly rawSubscriptions = new Map<number, RawSubscriptionRecord>();

    constructor(options?: PublicWebsocketClientOptions) {
        this.url = options?.url ?? DEFAULT_PUBLIC_WS_URL;
        this.headers = this.buildHeaders(options?.headers);
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
        const socket = this.createSocket();
        this.socket = socket;

        this.attachListener(socket, 'open', () => this.handleOpen());
        this.attachListener(socket, 'message', (event: unknown) => this.handleIncomingMessage(event));
        this.attachListener(socket, 'error', (event: unknown) => {
            this.onError?.(event);
        });
        this.attachListener(socket, 'close', (event?: { code?: number; reason?: string }) => this.handleClose(event));
    }

    public close(): void {
        this.manuallyClosed = true;
        this.clearTimers();
        this.pendingRequests.clear();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.reconnectAttempts = 0;
    }

    // -----------------------------------------------------------------------
    // Subscribe helpers
    // -----------------------------------------------------------------------

    public subscribeOrderBook(
        params: OrderBookSubscribeParams | MmOrderBookSubscribeParams,
        handler: StreamHandler<OrderBookStreamData, OrderBookSubscribeParams | MmOrderBookSubscribeParams>
    ): PublicWebsocketSubscription {
        const id = this.nextSubscriptionId++;
        this.orderBookSubscriptions.set(id, { id, params, handler });
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeOrderBook(id) };
    }

    public subscribePortfolio(
        params: PortfolioSubscribeParams,
        handler: StreamHandler<PortfolioStreamData, PortfolioSubscribeParams>
    ): PublicWebsocketSubscription {
        const id = this.nextSubscriptionId++;
        this.portfolioSubscriptions.set(id, { id, params, handler });
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribePortfolio(id) };
    }

    public subscribeKline(
        params: KlineSubscribeParams,
        handler: StreamHandler<KlineStreamData, KlineSubscribeParams>
    ): PublicWebsocketSubscription {
        const id = this.nextSubscriptionId++;
        this.klineSubscriptions.set(id, { id, params, handler });
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeKline(id) };
    }

    public subscribeInstrument(
        params: InstrumentSubscribeParams,
        handler: StreamHandler<InstrumentStreamData | MarketPairInfoChangedData, InstrumentSubscribeParams>
    ): PublicWebsocketSubscription {
        const id = this.nextSubscriptionId++;
        this.instrumentSubscriptions.set(id, { id, params, handler });
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeInstrument(id) };
    }

    public subscribeInstrumentBasicInfo(
        params: InstrumentBasicInfoSubscribeParams,
        handler: StreamHandler<InstrumentBasicInfoStreamData, InstrumentBasicInfoSubscribeParams>
    ): PublicWebsocketSubscription {
        const id = this.nextSubscriptionId++;
        this.instrumentBasicInfoSubscriptions.set(id, { id, params, handler });
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeInstrumentBasicInfo(id) };
    }

    public subscribeCommon(
        params: CommonSubscribeParams,
        handler: StreamHandler<MarketListChangedData | BlockNumChangedData, CommonSubscribeParams>
    ): PublicWebsocketSubscription {
        const id = this.nextSubscriptionId++;
        this.commonSubscriptions.set(id, { id, params, handler });
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeCommon(id) };
    }

    public subscribeRaw(
        params: RawSubscribeParams,
        handler: StreamHandler<GenericStreamData, RawSubscribeParams>,
        streams?: string | string[]
    ): PublicWebsocketSubscription {
        const id = this.nextSubscriptionId++;
        const streamList = Array.isArray(streams) ? streams : streams ? [streams] : [params.type];
        this.rawSubscriptions.set(id, { id, params, handler, streams: streamList });
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeRaw(id) };
    }

    public subscribeTrades(
        params: MmTradesSubscribeParams,
        handler: StreamHandler<TradesStreamData, MmTradesSubscribeParams>
    ): PublicWebsocketSubscription {
        if (!params.pairs?.length) {
            throw new Error('Trades subscription requires a non-empty `pairs` array.');
        }
        const id = this.nextSubscriptionId++;
        const pairSet = new Set(params.pairs.map(p => p.toLowerCase()));
        this.tradesSubscriptions.set(id, { id, params, handler, pairSet });
        this.connect();
        this.sendSubscribeIfOpen(params);

        return { unsubscribe: () => this.unsubscribeTrades(id) };
    }

    // -----------------------------------------------------------------------
    // Unsubscribe helpers
    // -----------------------------------------------------------------------

    private unsubscribeOrderBook(id: number): void {
        const record = this.orderBookSubscriptions.get(id);
        if (!record) return;
        this.orderBookSubscriptions.delete(id);
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribePortfolio(id: number): void {
        const record = this.portfolioSubscriptions.get(id);
        if (!record) return;
        this.portfolioSubscriptions.delete(id);
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeTrades(id: number): void {
        const record = this.tradesSubscriptions.get(id);
        if (!record) return;
        this.tradesSubscriptions.delete(id);
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeKline(id: number): void {
        const record = this.klineSubscriptions.get(id);
        if (!record) return;
        this.klineSubscriptions.delete(id);
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeInstrument(id: number): void {
        const record = this.instrumentSubscriptions.get(id);
        if (!record) return;
        this.instrumentSubscriptions.delete(id);
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeInstrumentBasicInfo(id: number): void {
        const record = this.instrumentBasicInfoSubscriptions.get(id);
        if (!record) return;
        this.instrumentBasicInfoSubscriptions.delete(id);
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeCommon(id: number): void {
        const record = this.commonSubscriptions.get(id);
        if (!record) return;
        this.commonSubscriptions.delete(id);
        this.sendUnsubscribeIfOpen(record.params);
    }

    private unsubscribeRaw(id: number): void {
        const record = this.rawSubscriptions.get(id);
        if (!record) return;
        this.rawSubscriptions.delete(id);
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
        for (const { params } of this.orderBookSubscriptions.values()) this.sendSubscribeIfOpen(params);
        for (const { params } of this.portfolioSubscriptions.values()) this.sendSubscribeIfOpen(params);
        for (const { params } of this.tradesSubscriptions.values()) this.sendSubscribeIfOpen(params);
        for (const { params } of this.klineSubscriptions.values()) this.sendSubscribeIfOpen(params);
        for (const { params } of this.instrumentSubscriptions.values()) this.sendSubscribeIfOpen(params);
        for (const { params } of this.instrumentBasicInfoSubscriptions.values()) this.sendSubscribeIfOpen(params);
        for (const { params } of this.commonSubscriptions.values()) this.sendSubscribeIfOpen(params);
        for (const { params } of this.rawSubscriptions.values()) this.sendSubscribeIfOpen(params);
    }

    private sendSubscribeIfOpen(params: PublicWsSubscribeParams): void {
        if (this.socket?.readyState !== WS_READY_STATE.OPEN) return;
        this.sendRequest('SUBSCRIBE', params);
    }

    private sendUnsubscribeIfOpen(params: PublicWsSubscribeParams): void {
        if (this.socket?.readyState !== WS_READY_STATE.OPEN) return;
        this.sendRequest('UNSUBSCRIBE', params);
    }

    private sendRequest(method: PublicWsRequestMethod, params: PublicWsSubscribeParams): void {
        const requestParams = this.buildRequestParams(params);
        const id = this.nextRequestId++;
        this.pendingRequests.set(id, { method, params: requestParams, sentAtMs: Date.now() });
        this.sendRaw(JSON.stringify({ id, method, params: requestParams }));
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
        const text = this.extractMessageText(event);
        if (!text || text === 'pong') return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return;
        }

        if (this.isWsAckMessage(parsed)) {
            this.onMessage?.(parsed);
            this.handleWsAckMessage(parsed);
            return;
        }

        if (!this.isWsStreamMessage(parsed)) return;
        this.onMessage?.(parsed);

        const message = parsed;

        const merged = this.mergeStreamMetadata(message);

        switch (message.stream) {
            case 'orderBook': {
                this.notifyRawSubscribers(message.stream, merged);
                const normalized = this.normalizeOrderBookStream(merged);
                if (normalized) {
                    this.notifyOrderBookSubscribers(normalized);
                }
                break;
            }
            case 'portfolio':
                if (this.isPortfolioStreamData(merged)) {
                    this.notifyPortfolioSubscribers(merged);
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'kline':
                this.notifyKlineSubscribers(merged as KlineStreamData);
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'instrument':
                this.notifyInstrumentSubscribers(merged as InstrumentStreamData);
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'instrumentBasicInfo':
                this.notifyInstrumentBasicInfoSubscribers(merged as InstrumentBasicInfoStreamData);
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'marketPairInfoChanged':
                this.notifyInstrumentSubscribers(merged as MarketPairInfoChangedData);
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'marketListChanged':
                this.notifyCommonSubscribers(merged, message.stream);
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'blockNumChanged':
                this.notifyCommonSubscribers(merged, message.stream);
                this.notifyRawSubscribers(message.stream, merged);
                break;
            case 'trades': {
                const normalized = this.normalizeTradesStreamData(merged);
                if (normalized) {
                    this.notifyTradesSubscribers(normalized);
                } else {
                    this.onInvalidStreamData?.({ stream: message.stream, message, merged });
                }
                this.notifyRawSubscribers(message.stream, merged);
                break;
            }
            default:
                this.notifyRawSubscribers(message.stream, merged);
                break;
        }
    }

    private notifyOrderBookSubscribers(data: OrderBookStreamData): void {
        for (const record of this.orderBookSubscriptions.values()) {
            if (this.orderBookMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyPortfolioSubscribers(data: PortfolioStreamData): void {
        for (const record of this.portfolioSubscriptions.values()) {
            if (this.portfolioMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyKlineSubscribers(data: KlineStreamData): void {
        for (const record of this.klineSubscriptions.values()) {
            if (this.klineMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyInstrumentSubscribers(data: InstrumentStreamData | MarketPairInfoChangedData): void {
        for (const record of this.instrumentSubscriptions.values()) {
            if (this.instrumentMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyInstrumentBasicInfoSubscribers(data: InstrumentBasicInfoStreamData): void {
        for (const record of this.instrumentBasicInfoSubscriptions.values()) {
            if (this.instrumentBasicInfoMatches(record.params, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyCommonSubscribers(data: GenericStreamData, stream: string): void {
        for (const record of this.commonSubscriptions.values()) {
            if (this.commonMatches(record.params, data, stream)) {
                if (stream === 'marketListChanged') {
                    const items = (data as { data?: unknown }).data;
                    if (Array.isArray(items)) {
                        record.handler(
                            { chainId: record.params.chainId, data: items as MarketListItem[] },
                            { params: record.params }
                        );
                        continue;
                    }
                }
                record.handler(data as unknown as MarketListChangedData | BlockNumChangedData, { params: record.params });
            }
        }
    }

    private notifyRawSubscribers(stream: string, data: GenericStreamData): void {
        for (const record of this.rawSubscriptions.values()) {
            if (this.rawMatches(stream, record, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private notifyTradesSubscribers(data: TradesStreamData): void {
        for (const record of this.tradesSubscriptions.values()) {
            if (this.tradesMatches(record, data)) {
                record.handler(data, { params: record.params });
            }
        }
    }

    private isWsAckMessage(value: unknown): value is PublicWsAckMessage {
        if (!value || typeof value !== 'object') return false;
        const record = value as Record<string, unknown>;
        return typeof record.id === 'number' && typeof record.result === 'string';
    }

    private isWsStreamMessage(value: unknown): value is PublicWsWireStreamMessage {
        if (!value || typeof value !== 'object') return false;
        return typeof (value as { stream?: unknown }).stream === 'string';
    }

    private handleWsAckMessage(message: PublicWsAckMessage): void {
        const receivedAtMs = Date.now();
        const normalizedResult = message.result.trim().toLowerCase();
        const ok = normalizedResult === 'success' || normalizedResult.startsWith('success');

        const request = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);

        const event: PublicWsRequestResultEvent = request
            ? {
                id: message.id,
                method: request.method,
                params: request.params,
                result: message.result,
                ok,
                sentAtMs: request.sentAtMs,
                receivedAtMs,
                latencyMs: receivedAtMs - request.sentAtMs,
            }
            : {
                id: message.id,
                result: message.result,
                ok,
                receivedAtMs,
            };

        this.onRequestResult?.(event);
    }

    // -----------------------------------------------------------------------
    // Matching
    // -----------------------------------------------------------------------

    private orderBookMatches(
        params: OrderBookSubscribeParams | MmOrderBookSubscribeParams,
        data: OrderBookStreamData
    ): boolean {
        const chainId = this.normalizeOptionalNumber(data.chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;

        const dataInstrument = data.instrument?.toLowerCase();
        if (dataInstrument && dataInstrument !== params.instrument.toLowerCase()) return false;

        const expiry = this.normalizeOptionalNumber(data.expiry);
        if (expiry !== undefined && expiry !== params.expiry) return false;

        return true;
    }

    private portfolioMatches(params: PortfolioSubscribeParams, data: PortfolioStreamData): boolean {
        const chainId = this.normalizeOptionalNumber(data.chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;
        if (data.userAddress?.toLowerCase() !== params.userAddress.toLowerCase()) return false;
        return true;
    }

    private klineMatches(params: KlineSubscribeParams, data: KlineStreamData): boolean {
        const chainId = this.normalizeOptionalNumber(data.chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;

        const dataInstrument = typeof data.instrument === 'string' ? data.instrument.toLowerCase() : undefined;
        if (dataInstrument && dataInstrument !== params.instrument.toLowerCase()) return false;

        const expiry = this.normalizeOptionalNumber(data.expiry);
        if (expiry !== undefined && expiry !== params.expiry) return false;

        const interval = (data as { interval?: string }).interval;
        if (interval && interval !== params.interval) return false;

        return true;
    }

    private instrumentMatches(
        params: InstrumentSubscribeParams,
        data: InstrumentStreamData | MarketPairInfoChangedData
    ): boolean {
        const chainId = this.normalizeOptionalNumber((data as { chainId?: number }).chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;

        const dataInstrument = data.instrument?.toLowerCase();
        if (dataInstrument && dataInstrument !== params.instrument.toLowerCase()) return false;

        const expiry = this.normalizeOptionalNumber((data as { expiry?: number | string }).expiry);
        const expectedExpiry = this.normalizeOptionalNumber(params.expiry);
        if (expectedExpiry !== undefined && expiry !== undefined && expectedExpiry !== expiry) return false;

        return true;
    }

    private instrumentBasicInfoMatches(
        params: InstrumentBasicInfoSubscribeParams,
        data: InstrumentBasicInfoStreamData
    ): boolean {
        const chainId = this.normalizeOptionalNumber(data.chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;

        const dataInstrument = data.instrument?.toLowerCase();
        if (dataInstrument && dataInstrument !== params.instrument.toLowerCase()) return false;

        const expiry = this.normalizeOptionalNumber(data.expiry);
        if (expiry !== undefined && expiry !== params.expiry) return false;

        return true;
    }

    private commonMatches(params: CommonSubscribeParams, data: GenericStreamData, stream: string): boolean {
        const chainId = this.normalizeOptionalNumber((data as { chainId?: number }).chainId);
        if (chainId !== undefined && chainId !== params.chainId) return false;
        // For now accept both blockNumChanged and marketListChanged under common.
        return stream === 'blockNumChanged' || stream === 'marketListChanged';
    }

    private rawMatches(stream: string, record: RawSubscriptionRecord, data: GenericStreamData): boolean {
        if (!record.streams.includes(stream)) return false;

        const expectedChainId = this.normalizeOptionalNumber(record.params.chainId);
        const dataChainId = this.normalizeOptionalNumber((data as { chainId?: number }).chainId);
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

        const expectedExpiry = this.normalizeOptionalNumber(record.params.expiry);
        const dataExpiry = this.normalizeOptionalNumber((data as { expiry?: number | string }).expiry);
        if (expectedExpiry !== undefined && dataExpiry !== undefined && expectedExpiry !== dataExpiry) return false;

        return true;
    }

    private isPortfolioStreamData(data: GenericStreamData): data is PortfolioStreamData {
        const userAddress = (data as { userAddress?: unknown }).userAddress;
        const type = (data as { type?: unknown }).type;
        return typeof userAddress === 'string' && typeof type === 'string';
    }

    private normalizeTradesStreamData(data: GenericStreamData): TradesStreamData | null {
        if (!data || typeof data !== 'object') return null;
        const record = data as Record<string, unknown>;

        const chainId = this.normalizeOptionalNumber(record.chainId);
        const expiry = this.normalizeOptionalNumber(record.expiry);
        const instrument =
            typeof record.instrument === 'string'
                ? record.instrument
                : typeof record.instrumentAddress === 'string'
                    ? record.instrumentAddress
                    : undefined;

        if (chainId === undefined || expiry === undefined || typeof instrument !== 'string') return null;

        const rawItems = record.data;
        if (!Array.isArray(rawItems)) return null;

        const defaults: { chainId?: number; expiry?: number; instrument?: string } = {
            chainId,
            expiry,
            instrument,
        };

        const normalized: TradeItem[] = [];
        for (const rawItem of rawItems) {
            const item = this.normalizeTradeItem(rawItem, defaults);
            if (item) normalized.push(item);
        }

        if (normalized.length === 0) return null;

        return {
            chainId,
            instrument: instrument.toLowerCase() as Address,
            expiry,
            data: normalized,
        };
    }

    private normalizeTradeItem(
        data: unknown,
        defaults: { chainId?: number; expiry?: number; instrument?: string }
    ): TradeItem | null {
        if (!data || typeof data !== 'object') return null;
        const record = data as Record<string, unknown>;

        const id = record.id;
        const chainId = this.normalizeOptionalNumber(record.chainId) ?? defaults.chainId;
        const expiry = this.normalizeOptionalNumber(record.expiry) ?? defaults.expiry;
        if (chainId === undefined || expiry === undefined) return null;

        const instrument =
            typeof record.instrument === 'string'
                ? record.instrument
                : typeof record.instrumentAddress === 'string'
                    ? record.instrumentAddress
                    : defaults.instrument;

        const instrumentAddress =
            typeof record.instrumentAddress === 'string'
                ? record.instrumentAddress
                : typeof record.instrument === 'string'
                    ? record.instrument
                    : defaults.instrument;
        if (!instrument || !instrumentAddress) return null;

        const normalizedInstrument = instrument.toLowerCase();
        const normalizedInstrumentAddress = instrumentAddress.toLowerCase();

        const size = record.size;
        const balance = record.balance;
        const price = record.price;
        const tradeFee = record.tradeFee;
        const protocolFee = record.protocolFee;
        const timestamp = this.normalizeOptionalNumber(record.timestamp);
        const txHash = record.txHash;
        const type = record.type;
        const symbol = record.symbol;
        const typeString = record.typeString;
        const side = record.side;
        const event = record.event;
        const markPrice = record.markPrice;
        const fairPrice = record.fairPrice;

        const normalizeTokenInfo = (value: unknown): TradesTokenInfo | null => {
            if (!value || typeof value !== 'object') return null;

            const token = value as Record<string, unknown>;
            const address = token.address;
            const symbol = token.symbol;
            const decimals = this.normalizeOptionalNumber(token.decimals);
            const image = token.image;
            const price = this.normalizeOptionalNumber(token.price);

            if (
                typeof address !== 'string' ||
                typeof symbol !== 'string' ||
                decimals === undefined ||
                typeof image !== 'string' ||
                price === undefined
            ) {
                return null;
            }

            return {
                ...token,
                address,
                symbol,
                decimals,
                image,
                price,
            } as TradesTokenInfo;
        };

        const baseToken = normalizeTokenInfo(record.baseToken);
        const quoteToken = normalizeTokenInfo(record.quoteToken);

        if (
            typeof id !== 'string' ||
            typeof size !== 'string' ||
            typeof balance !== 'string' ||
            typeof price !== 'string' ||
            typeof tradeFee !== 'string' ||
            typeof protocolFee !== 'string' ||
            timestamp === undefined ||
            typeof txHash !== 'string' ||
            typeof type !== 'string' ||
            typeof symbol !== 'string' ||
            !baseToken ||
            !quoteToken ||
            typeof typeString !== 'string' ||
            typeof side !== 'string' ||
            typeof event !== 'string' ||
            typeof markPrice !== 'string' ||
            typeof fairPrice !== 'string'
        ) {
            return null;
        }

        return {
            ...record,
            id,
            chainId,
            instrument: normalizedInstrument as Address,
            instrumentAddress: normalizedInstrumentAddress as Address,
            expiry,
            size,
            balance,
            price,
            tradeFee,
            protocolFee,
            timestamp,
            txHash,
            type,
            symbol,
            baseToken,
            quoteToken,
            typeString,
            side,
            event,
            markPrice,
            fairPrice,
        };
    }

    private tradesMatches(record: TradesSubscriptionRecord, data: TradesStreamData): boolean {
        if (data.chainId !== record.params.chainId) return false;

        const instrument = data.instrument.toLowerCase();
        const pair = `${instrument}_${data.expiry}`;
        return record.pairSet.has(pair);
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    private mergeStreamMetadata(message: { data?: unknown } & BaseStreamMetadata): GenericStreamData {
        const data = message.data;
        const base: GenericStreamData = Array.isArray(data)
            ? { data }
            : data && typeof data === 'object'
                ? { ...(data as Record<string, unknown>) }
                : {};

        const mergeField = <T>(key: string, value: T | undefined): void => {
            if (value !== undefined) {
                base[key] = value as unknown;
            }
        };

        mergeField('chainId', message.chainId);
        mergeField('instrument', message.instrument);
        mergeField('expiry', message.expiry);

        return base;
    }

    private normalizeOrderBookStream(data: GenericStreamData): OrderBookStreamData | null {
        const raw = data as Record<string, any>;
        if (!raw || typeof raw !== 'object') {
            return null;
        }

        if (raw.depths && typeof raw.depths === 'object') {
            return raw as OrderBookStreamData;
        }

        const ratioKeys = Object.keys(raw).filter((k) => !Number.isNaN(Number(k)));
        if (ratioKeys.length > 0) {
            const depths: Record<string, OrderBookDepth> = {};
            const primaryDepth = raw[ratioKeys[0]];

            for (const key of ratioKeys) {
                const depth = raw[key];
                if (depth && typeof depth === 'object') {
                    depths[key] = {
                        blockInfo: depth.blockInfo,
                        bids: Array.isArray(depth.bids) ? depth.bids : [],
                        asks: Array.isArray(depth.asks) ? depth.asks : [],
                    };
                }
            }

            return {
                depths,
                chainId: (raw.chainId ?? primaryDepth?.chainId ?? 0) as number,
                instrument: (raw.instrument ?? primaryDepth?.instrument ?? '') as Address,
                expiry: (raw.expiry ?? primaryDepth?.expiry ?? 0) as number | string,
            };
        }

        return null;
    }

    private createSocket(): WebSocketLike {
        if (this.wsFactory) {
            return this.wsFactory(this.url, { headers: this.headers });
        }

        const globalWebSocketCtor = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
        if (globalWebSocketCtor) {
            return new globalWebSocketCtor(this.url);
        }

        throw new Error(
            'No WebSocket implementation found. Provide `wsFactory` or ensure `globalThis.WebSocket` is available (e.g. browsers or Node.js 20+).'
        );
    }

    private attachListener(socket: WebSocketLike, event: string, handler: (...args: any[]) => void): void {
        if (typeof socket.addEventListener === 'function') {
            socket.addEventListener(event, handler);
            return;
        }

        if (typeof socket.on === 'function') {
            socket.on(event, handler);
            return;
        }

        (socket as any)[`on${event}`] = handler;
    }

    private extractMessageText(event: unknown): string | null {
        if (typeof event === 'string') return event;

        const candidate = (event as { data?: unknown })?.data ?? event;
        if (typeof candidate === 'string') return candidate;

        if (candidate && typeof (candidate as { toString: () => string }).toString === 'function') {
            return (candidate as { toString: () => string }).toString();
        }

        return null;
    }

    private normalizeOptionalNumber(value: unknown): number | undefined {
        if (value === undefined || value === null) return undefined;
        const num = typeof value === 'string' ? Number(value) : (value as number);
        return Number.isFinite(num) ? num : undefined;
    }

    private buildRequestParams(params: PublicWsSubscribeParams): Record<string, unknown> {
        const requestParams =
            'params' in params
                ? (() => {
                    const { params: extra, ...rest } = params as RawSubscribeParams;
                    return { ...(rest as unknown as Record<string, unknown>), ...(extra ?? {}) };
                })()
                : { ...(params as unknown as Record<string, unknown>) };

        return this.normalizeRequestParams(requestParams);
    }

    private normalizeRequestParams(params: Record<string, unknown>): Record<string, unknown> {
        const normalized: Record<string, unknown> = { ...params };

        const instrument = normalized.instrument;
        if (typeof instrument === 'string') {
            normalized.instrument = instrument.toLowerCase();
        }

        const userAddress = normalized.userAddress;
        if (typeof userAddress === 'string') {
            normalized.userAddress = userAddress.toLowerCase();
        }

        const pairs = normalized.pairs;
        if (Array.isArray(pairs)) {
            normalized.pairs = pairs.filter((pair): pair is string => typeof pair === 'string').map((pair) => pair.toLowerCase());
        }

        return normalized;
    }

    private buildHeaders(overrides?: Record<string, string>): Record<string, string> {
        const urlObj = new URL(this.url);
        const origin =
            urlObj.protocol === 'wss:'
                ? `https://${urlObj.host}`
                : urlObj.protocol === 'ws:'
                    ? `http://${urlObj.host}`
                    : `${urlObj.protocol}//${urlObj.host}`;
        return {
            'User-Agent': DEFAULT_USER_AGENT,
            Origin: origin,
            ...overrides,
        };
    }
}
