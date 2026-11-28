import type {
    CommonSubscribeParams,
    GenericStreamData,
    InstrumentBasicInfoStreamData,
    InstrumentBasicInfoSubscribeParams,
    InstrumentStreamData,
    InstrumentSubscribeParams,
    KlineStreamData,
    KlineSubscribeParams,
    MarketListChangedData,
    MarketPairInfoChangedData,
    MmTradesSubscribeParams,
    OrderBookStreamData,
    OrderBookSubscribeParams,
    PortfolioStreamData,
    PortfolioSubscribeParams,
    RawSubscribeParams,
    TradesStreamData,
    BlockNumChangedData,
} from '../websocket';

export type StreamHandler<TPayload, TParams> = (payload: TPayload, context: { params: TParams }) => void;

export interface SubscriptionRecord<TParams, TPayload> {
    id: number;
    params: TParams;
    handler: StreamHandler<TPayload, TParams>;
}

export interface RawSubscriptionRecord extends SubscriptionRecord<RawSubscribeParams, GenericStreamData> {
    streams: string[];
}

export interface TradesSubscriptionRecord extends SubscriptionRecord<MmTradesSubscribeParams, TradesStreamData> {
    pairSet: Set<string>;
}

export class PublicWsSubscriptionRegistry {
    private nextSubscriptionId = 1;

    private readonly orderBookSubscriptions = new Map<
        number,
        SubscriptionRecord<OrderBookSubscribeParams, OrderBookStreamData>
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

    addOrderBook(
        params: OrderBookSubscribeParams,
        handler: StreamHandler<OrderBookStreamData, OrderBookSubscribeParams>
    ): SubscriptionRecord<OrderBookSubscribeParams, OrderBookStreamData> {
        const record = { id: this.nextId(), params, handler };
        this.orderBookSubscriptions.set(record.id, record);
        return record;
    }

    removeOrderBook(id: number): SubscriptionRecord<OrderBookSubscribeParams, OrderBookStreamData> | undefined {
        return this.remove(this.orderBookSubscriptions, id);
    }

    orderBooks(): IterableIterator<SubscriptionRecord<OrderBookSubscribeParams, OrderBookStreamData>> {
        return this.orderBookSubscriptions.values();
    }

    addPortfolio(
        params: PortfolioSubscribeParams,
        handler: StreamHandler<PortfolioStreamData, PortfolioSubscribeParams>
    ): SubscriptionRecord<PortfolioSubscribeParams, PortfolioStreamData> {
        const record = { id: this.nextId(), params, handler };
        this.portfolioSubscriptions.set(record.id, record);
        return record;
    }

    removePortfolio(id: number): SubscriptionRecord<PortfolioSubscribeParams, PortfolioStreamData> | undefined {
        return this.remove(this.portfolioSubscriptions, id);
    }

    portfolios(): IterableIterator<SubscriptionRecord<PortfolioSubscribeParams, PortfolioStreamData>> {
        return this.portfolioSubscriptions.values();
    }

    addTrades(
        params: MmTradesSubscribeParams,
        handler: StreamHandler<TradesStreamData, MmTradesSubscribeParams>
    ): TradesSubscriptionRecord {
        const record = {
            id: this.nextId(),
            params,
            handler,
            pairSet: new Set(params.pairs.map((p) => p.toLowerCase())),
        };
        this.tradesSubscriptions.set(record.id, record);
        return record;
    }

    removeTrades(id: number): TradesSubscriptionRecord | undefined {
        return this.remove(this.tradesSubscriptions, id);
    }

    trades(): IterableIterator<TradesSubscriptionRecord> {
        return this.tradesSubscriptions.values();
    }

    addKline(
        params: KlineSubscribeParams,
        handler: StreamHandler<KlineStreamData, KlineSubscribeParams>
    ): SubscriptionRecord<KlineSubscribeParams, KlineStreamData> {
        const record = { id: this.nextId(), params, handler };
        this.klineSubscriptions.set(record.id, record);
        return record;
    }

    removeKline(id: number): SubscriptionRecord<KlineSubscribeParams, KlineStreamData> | undefined {
        return this.remove(this.klineSubscriptions, id);
    }

    klines(): IterableIterator<SubscriptionRecord<KlineSubscribeParams, KlineStreamData>> {
        return this.klineSubscriptions.values();
    }

    addInstrument(
        params: InstrumentSubscribeParams,
        handler: StreamHandler<InstrumentStreamData | MarketPairInfoChangedData, InstrumentSubscribeParams>
    ): SubscriptionRecord<InstrumentSubscribeParams, InstrumentStreamData | MarketPairInfoChangedData> {
        const record = { id: this.nextId(), params, handler };
        this.instrumentSubscriptions.set(record.id, record);
        return record;
    }

    removeInstrument(
        id: number
    ): SubscriptionRecord<InstrumentSubscribeParams, InstrumentStreamData | MarketPairInfoChangedData> | undefined {
        return this.remove(this.instrumentSubscriptions, id);
    }

    instruments(): IterableIterator<
        SubscriptionRecord<InstrumentSubscribeParams, InstrumentStreamData | MarketPairInfoChangedData>
    > {
        return this.instrumentSubscriptions.values();
    }

    addInstrumentBasicInfo(
        params: InstrumentBasicInfoSubscribeParams,
        handler: StreamHandler<InstrumentBasicInfoStreamData, InstrumentBasicInfoSubscribeParams>
    ): SubscriptionRecord<InstrumentBasicInfoSubscribeParams, InstrumentBasicInfoStreamData> {
        const record = { id: this.nextId(), params, handler };
        this.instrumentBasicInfoSubscriptions.set(record.id, record);
        return record;
    }

    removeInstrumentBasicInfo(
        id: number
    ): SubscriptionRecord<InstrumentBasicInfoSubscribeParams, InstrumentBasicInfoStreamData> | undefined {
        return this.remove(this.instrumentBasicInfoSubscriptions, id);
    }

    instrumentBasicInfos(): IterableIterator<
        SubscriptionRecord<InstrumentBasicInfoSubscribeParams, InstrumentBasicInfoStreamData>
    > {
        return this.instrumentBasicInfoSubscriptions.values();
    }

    addCommon(
        params: CommonSubscribeParams,
        handler: StreamHandler<MarketListChangedData | BlockNumChangedData, CommonSubscribeParams>
    ): SubscriptionRecord<CommonSubscribeParams, MarketListChangedData | BlockNumChangedData> {
        const record = { id: this.nextId(), params, handler };
        this.commonSubscriptions.set(record.id, record);
        return record;
    }

    removeCommon(
        id: number
    ): SubscriptionRecord<CommonSubscribeParams, MarketListChangedData | BlockNumChangedData> | undefined {
        return this.remove(this.commonSubscriptions, id);
    }

    commons(): IterableIterator<
        SubscriptionRecord<CommonSubscribeParams, MarketListChangedData | BlockNumChangedData>
    > {
        return this.commonSubscriptions.values();
    }

    addRaw(
        params: RawSubscribeParams,
        handler: StreamHandler<GenericStreamData, RawSubscribeParams>,
        streams?: string | string[]
    ): RawSubscriptionRecord {
        const streamList = Array.isArray(streams) ? streams : streams ? [streams] : [params.type];
        const record = { id: this.nextId(), params, handler, streams: streamList };
        this.rawSubscriptions.set(record.id, record);
        return record;
    }

    removeRaw(id: number): RawSubscriptionRecord | undefined {
        return this.remove(this.rawSubscriptions, id);
    }

    raws(): IterableIterator<RawSubscriptionRecord> {
        return this.rawSubscriptions.values();
    }

    *params(): IterableIterator<object> {
        const groups = [
            this.orderBooks(),
            this.portfolios(),
            this.trades(),
            this.klines(),
            this.instruments(),
            this.instrumentBasicInfos(),
            this.commons(),
            this.raws(),
        ];
        for (const group of groups) for (const record of group) yield record.params;
    }

    private nextId(): number {
        return this.nextSubscriptionId++;
    }

    private remove<TRecord>(records: Map<number, TRecord>, id: number): TRecord | undefined {
        const record = records.get(id);
        if (record) {
            records.delete(id);
        }
        return record;
    }
}
