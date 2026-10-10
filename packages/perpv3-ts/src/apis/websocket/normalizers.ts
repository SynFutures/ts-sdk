import type { Address } from 'viem';
import type { BlockInfo } from '../../types';
import type {
    BlockNumChangedData,
    CommonSubscribeParams,
    GenericStreamData,
    InstrumentBasicInfoStreamData,
    InstrumentStreamData,
    KlineStreamData,
    MarketListChangedData,
    MarketListItem,
    OrderBookDepth,
    OrderBookLevel,
    OrderBookStreamData,
    PortfolioOrderInfo,
    PortfolioStreamData,
    PortfolioStreamType,
    TradeItem,
    TradesStreamData,
    TradesTokenInfo,
} from '../websocket';
import {
    isRecord,
    optionalAddress,
    optionalNumber,
    optionalString,
    parseOptionalNumber,
    requireAddress,
    requireArray,
    requireNumber,
    requireRecord,
    requireString,
    type UnknownRecord,
} from '../codecs';
import type { PublicWsStreamMetadata } from './protocol';

// Stream decoders throw on malformed payloads; the client catches at the message boundary and reports
// the payload through `onInvalidStreamData`.

export type NormalizedStreamPayload =
    | { kind: 'record'; data: Record<string, unknown> }
    | { kind: 'array'; data: unknown[] }
    | { kind: 'empty'; data: undefined };

export function normalizeStreamPayload(message: { data?: unknown }): NormalizedStreamPayload {
    if (isRecord(message.data)) {
        return { kind: 'record', data: message.data };
    }
    if (Array.isArray(message.data)) {
        return { kind: 'array', data: message.data };
    }
    return { kind: 'empty', data: undefined };
}

export function mergeStreamMetadata(message: { data?: unknown } & PublicWsStreamMetadata): GenericStreamData {
    const payload = normalizeStreamPayload(message);
    const base: GenericStreamData =
        payload.kind === 'array' ? { data: payload.data } : payload.kind === 'record' ? { ...payload.data } : {};

    const mergeField = <T>(key: string, value: T | undefined): void => {
        if (value !== undefined) {
            base[key] = value;
        }
    };

    mergeField('chainId', message.chainId);
    mergeField('instrument', message.instrument);
    mergeField('expiry', message.expiry);

    return base;
}

/** Drops absent optional fields so typed payloads only carry keys the server sent. */
function compact<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

/** Expiry is numeric on most streams but may arrive as a non-numeric string label. */
function requireExpiry(record: UnknownRecord, key: string, label = key): number | string {
    return parseOptionalNumber(record[key]) ?? requireString(record, key, label);
}

function optionalExpiry(record: UnknownRecord, key: string): number | string | undefined {
    return record[key] === undefined ? undefined : requireExpiry(record, key);
}

const PORTFOLIO_STREAM_TYPES: readonly PortfolioStreamType[] = ['order', 'range', 'position', 'gate'];

function requirePortfolioStreamType(value: unknown): PortfolioStreamType {
    const type = PORTFOLIO_STREAM_TYPES.find((candidate) => candidate === value);
    if (type === undefined) {
        throw new Error(`Invalid type: unsupported portfolio stream type ${String(value)}`);
    }
    return type;
}

function decodePortfolioOrderInfo(value: unknown): PortfolioOrderInfo | undefined {
    if (value === undefined) return undefined;
    const record = requireRecord(value, 'orderInfo');
    const orderInfo = compact({
        oid: optionalString(record, 'oid', 'orderInfo.oid'),
        orderId: optionalString(record, 'orderId', 'orderInfo.orderId'),
        type: optionalString(record, 'type', 'orderInfo.type'),
    });
    return Object.keys(orderInfo).length > 0 ? orderInfo : undefined;
}

export function decodePortfolioStreamData(data: GenericStreamData): PortfolioStreamData {
    return compact({
        chainId: optionalNumber(data, 'chainId'),
        userAddress: requireAddress(data, 'userAddress'),
        instrument: optionalAddress(data, 'instrument'),
        expiry: optionalExpiry(data, 'expiry'),
        type: requirePortfolioStreamType(data.type),
        orderInfo: decodePortfolioOrderInfo(data.orderInfo),
    });
}

export function decodeKlineStreamData(data: GenericStreamData): KlineStreamData {
    return compact({
        chainId: requireNumber(data, 'chainId'),
        instrument: requireAddress(data, 'instrument'),
        expiry: requireExpiry(data, 'expiry'),
        interval: requireString(data, 'interval'),
        open: optionalNumber(data, 'open'),
        high: optionalNumber(data, 'high'),
        low: optionalNumber(data, 'low'),
        close: optionalNumber(data, 'close'),
        baseVolume: optionalNumber(data, 'baseVolume'),
        quoteVolume: optionalNumber(data, 'quoteVolume'),
        volumeUSD: optionalNumber(data, 'volumeUSD'),
        timestamp: optionalNumber(data, 'timestamp'),
        startTime: optionalNumber(data, 'startTime'),
        endTime: optionalNumber(data, 'endTime'),
    });
}

export function decodeInstrumentStreamData(data: GenericStreamData): InstrumentStreamData {
    return compact({
        chainId: requireNumber(data, 'chainId'),
        instrument: requireAddress(data, 'instrument'),
        expiry: requireExpiry(data, 'expiry'),
        symbol: optionalString(data, 'symbol'),
        markPrice: optionalString(data, 'markPrice'),
        fairPrice: optionalString(data, 'fairPrice'),
    });
}

export function decodeInstrumentBasicInfoStreamData(data: GenericStreamData): InstrumentBasicInfoStreamData {
    return compact({
        chainId: requireNumber(data, 'chainId'),
        instrument: requireAddress(data, 'instrument'),
        expiry: requireExpiry(data, 'expiry'),
        symbol: optionalString(data, 'symbol'),
    });
}

export function decodeOrderBookStream(data: GenericStreamData): OrderBookStreamData {
    // Depths are keyed by ratio next to the merged wrapper metadata.
    const ratioKeys = Object.keys(data).filter((key) => !Number.isNaN(Number(key)));
    if (ratioKeys.length === 0) {
        throw new Error('Invalid orderBook: expected depths');
    }

    return {
        chainId: requireNumber(data, 'chainId'),
        instrument: requireAddress(data, 'instrument'),
        expiry: requireExpiry(data, 'expiry'),
        depths: Object.fromEntries(ratioKeys.map((key) => [key, decodeOrderBookDepth(data[key], `depths.${key}`)])),
    };
}

function decodeOrderBookDepth(value: unknown, label: string): OrderBookDepth {
    const record = requireRecord(value, label);
    return compact({
        blockInfo: decodeBlockInfo(record.blockInfo, `${label}.blockInfo`),
        bids: decodeOrderBookLevels(record.bids, `${label}.bids`),
        asks: decodeOrderBookLevels(record.asks, `${label}.asks`),
    });
}

function decodeBlockInfo(value: unknown, label: string): BlockInfo | undefined {
    if (value === undefined || value === null) return undefined;
    const record = requireRecord(value, label);
    return {
        timestamp: requireNumber(record, 'timestamp', `${label}.timestamp`),
        height: requireNumber(record, 'height', `${label}.height`),
    };
}

function decodeOrderBookLevels(value: unknown, label: string): OrderBookLevel[] {
    // The server sends `null` for an empty side (observed on mainnet for unpopulated ratios).
    if (value === null) return [];
    return requireArray(value, label).map((item, index) => {
        const itemLabel = `${label}[${index}]`;
        const record = requireRecord(item, itemLabel);
        return {
            tick: requireNumber(record, 'tick', `${itemLabel}.tick`),
            price: requireString(record, 'price', `${itemLabel}.price`),
            baseSize: requireString(record, 'baseSize', `${itemLabel}.baseSize`),
            quoteSize: requireString(record, 'quoteSize', `${itemLabel}.quoteSize`),
            baseSum: requireString(record, 'baseSum', `${itemLabel}.baseSum`),
            quoteSum: requireString(record, 'quoteSum', `${itemLabel}.quoteSum`),
        };
    });
}

export function decodeCommonStreamData(
    data: GenericStreamData,
    stream: string,
    params: CommonSubscribeParams
): MarketListChangedData | BlockNumChangedData {
    const chainId = optionalNumber(data, 'chainId') ?? params.chainId;

    if (stream === 'marketListChanged') {
        const items = requireArray(data.data, 'marketListChanged.data').map(
            (item, index) => requireRecord(item, `marketListChanged.data[${index}]`) as MarketListItem
        );
        return { chainId, data: items };
    }

    if (stream === 'blockNumChanged') {
        return compact({
            chainId,
            blockNum: requireNumber(data, 'blockNum'),
            blockTime: optionalNumber(data, 'blockTime'),
        });
    }

    throw new Error(`Invalid stream: unsupported common stream ${stream}`);
}

export function decodeTradesStreamData(data: GenericStreamData): TradesStreamData {
    const chainId = requireNumber(data, 'chainId');
    const instrument = requireAddress(data, 'instrument').toLowerCase() as Address;
    const expiry = requireNumber(data, 'expiry');

    // Subscribers are matched on the wrapper pair, so every item must belong to it.
    const trades = requireArray(data.data, 'trades.data').map((item, index) => {
        const label = `trades.data[${index}]`;
        const trade = decodeTradeItem(item, label);
        if (trade.chainId !== chainId || trade.instrumentAddress !== instrument || trade.expiry !== expiry) {
            throw new Error(`Invalid ${label}: trade does not belong to the message chain and pair`);
        }
        return trade;
    });

    return { chainId, instrument, expiry, data: trades };
}

function decodeTradeItem(value: unknown, label: string): TradeItem {
    const record = requireRecord(value, label);
    const string = (key: string) => requireString(record, key, `${label}.${key}`);
    const number = (key: string) => requireNumber(record, key, `${label}.${key}`);

    return {
        id: string('id'),
        chainId: number('chainId'),
        instrumentAddress: requireAddress(
            record,
            'instrumentAddress',
            `${label}.instrumentAddress`
        ).toLowerCase() as Address,
        expiry: number('expiry'),
        trader: requireAddress(record, 'trader', `${label}.trader`),
        size: string('size'),
        balance: string('balance'),
        price: string('price'),
        tradeFee: string('tradeFee'),
        protocolFee: string('protocolFee'),
        timestamp: number('timestamp'),
        txHash: string('txHash'),
        type: string('type'),
        symbol: string('symbol'),
        baseToken: decodeTokenInfo(record.baseToken, `${label}.baseToken`),
        quoteToken: decodeTokenInfo(record.quoteToken, `${label}.quoteToken`),
        typeString: string('typeString'),
        side: string('side'),
        event: string('event'),
        markPrice: string('markPrice'),
        fairPrice: string('fairPrice'),
    };
}

function decodeTokenInfo(value: unknown, label: string): TradesTokenInfo {
    const record = requireRecord(value, label);
    return {
        address: requireString(record, 'address', `${label}.address`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
        decimals: requireNumber(record, 'decimals', `${label}.decimals`),
        image: requireString(record, 'image', `${label}.image`),
        price: requireNumber(record, 'price', `${label}.price`),
    };
}
