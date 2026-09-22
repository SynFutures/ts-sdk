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
    TradeItem,
    TradesStreamData,
    TradesTokenInfo,
} from '../websocket';
import { readOptionalField, readRequiredField, type FieldResult } from './fields';
import type { PublicWsStreamMetadata } from './protocol';

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

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

export function normalizeOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const num = typeof value === 'string' ? Number(value) : (value as number);
    return Number.isFinite(num) ? num : undefined;
}

export function isPortfolioStreamData(data: GenericStreamData): data is PortfolioStreamData {
    const userAddress = data.userAddress;
    const type = data.type;
    return typeof userAddress === 'string' && typeof type === 'string';
}

function isPortfolioStreamType(value: unknown): value is PortfolioStreamData['type'] {
    return value === 'order' || value === 'range' || value === 'position' || value === 'gate';
}

function normalizeAddress(value: unknown): Address | undefined {
    return typeof value === 'string' ? (value as Address) : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function normalizeNumberOrString(value: unknown): number | string | undefined {
    return normalizeOptionalNumber(value) ?? normalizeOptionalString(value);
}

function normalizePortfolioOrderInfo(value: unknown): FieldResult<PortfolioOrderInfo | undefined> {
    if (value === undefined) return { ok: true, value: undefined };
    if (!isRecord(value)) return { ok: false };

    const oid = readOptionalField(value, 'oid', normalizeOptionalString);
    const orderId = readOptionalField(value, 'orderId', normalizeOptionalString);
    const type = readOptionalField(value, 'type', normalizeOptionalString);
    if (!oid.ok || !orderId.ok || !type.ok) return { ok: false };

    if (oid.value === undefined && orderId.value === undefined && type.value === undefined) {
        return { ok: true, value: undefined };
    }

    return {
        ok: true,
        value: {
            ...(oid.value !== undefined ? { oid: oid.value } : {}),
            ...(orderId.value !== undefined ? { orderId: orderId.value } : {}),
            ...(type.value !== undefined ? { type: type.value } : {}),
        },
    };
}

export function normalizePortfolioStreamData(data: GenericStreamData): PortfolioStreamData | null {
    const userAddress = readRequiredField(data, 'userAddress', normalizeAddress);
    const type = readRequiredField(data, 'type', (value) => (isPortfolioStreamType(value) ? value : undefined));
    const chainId = readOptionalField(data, 'chainId', normalizeOptionalNumber);
    const instrument = readOptionalField(data, 'instrument', normalizeAddress);
    const expiry = readOptionalField(data, 'expiry', normalizeNumberOrString);
    const orderInfo = normalizePortfolioOrderInfo(data.orderInfo);
    if (!userAddress.ok || !type.ok || !chainId.ok || !instrument.ok || !expiry.ok || !orderInfo.ok) return null;

    return {
        ...(chainId.value !== undefined ? { chainId: chainId.value } : {}),
        userAddress: userAddress.value,
        ...(instrument.value !== undefined ? { instrument: instrument.value } : {}),
        ...(expiry.value !== undefined ? { expiry: expiry.value } : {}),
        type: type.value,
        ...(orderInfo.value !== undefined ? { orderInfo: orderInfo.value } : {}),
    };
}

export function normalizeKlineStreamData(data: GenericStreamData): KlineStreamData | null {
    const chainId = readRequiredField(data, 'chainId', normalizeOptionalNumber);
    const instrument = readRequiredField(data, 'instrument', normalizeAddress);
    const expiry = readRequiredField(data, 'expiry', normalizeNumberOrString);
    const interval = readRequiredField(data, 'interval', normalizeOptionalString);
    const open = readOptionalField(data, 'open', normalizeOptionalNumber);
    const high = readOptionalField(data, 'high', normalizeOptionalNumber);
    const low = readOptionalField(data, 'low', normalizeOptionalNumber);
    const close = readOptionalField(data, 'close', normalizeOptionalNumber);
    const baseVolume = readOptionalField(data, 'baseVolume', normalizeOptionalNumber);
    const quoteVolume = readOptionalField(data, 'quoteVolume', normalizeOptionalNumber);
    const volumeUSD = readOptionalField(data, 'volumeUSD', normalizeOptionalNumber);
    const timestamp = readOptionalField(data, 'timestamp', normalizeOptionalNumber);
    const startTime = readOptionalField(data, 'startTime', normalizeOptionalNumber);
    const endTime = readOptionalField(data, 'endTime', normalizeOptionalNumber);

    if (
        !chainId.ok ||
        !instrument.ok ||
        !expiry.ok ||
        !interval.ok ||
        !open.ok ||
        !high.ok ||
        !low.ok ||
        !close.ok ||
        !baseVolume.ok ||
        !quoteVolume.ok ||
        !volumeUSD.ok ||
        !timestamp.ok ||
        !startTime.ok ||
        !endTime.ok
    ) {
        return null;
    }

    return {
        chainId: chainId.value,
        instrument: instrument.value,
        expiry: expiry.value,
        interval: interval.value,
        ...(open.value !== undefined ? { open: open.value } : {}),
        ...(high.value !== undefined ? { high: high.value } : {}),
        ...(low.value !== undefined ? { low: low.value } : {}),
        ...(close.value !== undefined ? { close: close.value } : {}),
        ...(baseVolume.value !== undefined ? { baseVolume: baseVolume.value } : {}),
        ...(quoteVolume.value !== undefined ? { quoteVolume: quoteVolume.value } : {}),
        ...(volumeUSD.value !== undefined ? { volumeUSD: volumeUSD.value } : {}),
        ...(timestamp.value !== undefined ? { timestamp: timestamp.value } : {}),
        ...(startTime.value !== undefined ? { startTime: startTime.value } : {}),
        ...(endTime.value !== undefined ? { endTime: endTime.value } : {}),
    };
}

export function normalizeInstrumentStreamData(data: GenericStreamData): InstrumentStreamData | null {
    const chainId = readRequiredField(data, 'chainId', normalizeOptionalNumber);
    const instrument = readRequiredField(data, 'instrument', normalizeAddress);
    const expiry = readRequiredField(data, 'expiry', normalizeNumberOrString);
    const symbol = readOptionalField(data, 'symbol', normalizeOptionalString);
    const markPrice = readOptionalField(data, 'markPrice', normalizeOptionalString);
    const fairPrice = readOptionalField(data, 'fairPrice', normalizeOptionalString);
    if (!chainId.ok || !instrument.ok || !expiry.ok || !symbol.ok || !markPrice.ok || !fairPrice.ok) return null;

    return {
        chainId: chainId.value,
        instrument: instrument.value,
        expiry: expiry.value,
        ...(symbol.value !== undefined ? { symbol: symbol.value } : {}),
        ...(markPrice.value !== undefined ? { markPrice: markPrice.value } : {}),
        ...(fairPrice.value !== undefined ? { fairPrice: fairPrice.value } : {}),
    };
}

export function normalizeInstrumentBasicInfoStreamData(data: GenericStreamData): InstrumentBasicInfoStreamData | null {
    const chainId = readRequiredField(data, 'chainId', normalizeOptionalNumber);
    const instrument = readRequiredField(data, 'instrument', normalizeAddress);
    const expiry = readRequiredField(data, 'expiry', normalizeNumberOrString);
    const symbol = readOptionalField(data, 'symbol', normalizeOptionalString);
    if (!chainId.ok || !instrument.ok || !expiry.ok || !symbol.ok) return null;

    return {
        chainId: chainId.value,
        instrument: instrument.value,
        expiry: expiry.value,
        ...(symbol.value !== undefined ? { symbol: symbol.value } : {}),
    };
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

export function normalizeOrderBookStream(data: GenericStreamData): OrderBookStreamData | null {
    const raw = data;

    if (isRecord(raw.depths)) {
        const depths = normalizeOrderBookDepths(raw.depths);
        if (!depths) return null;
        const chainId = normalizeOptionalNumber(raw.chainId);
        const instrument = normalizeAddress(raw.instrument);
        const expiry = normalizeOptionalNumber(raw.expiry) ?? normalizeOptionalString(raw.expiry);
        if (chainId === undefined || !instrument || expiry === undefined) return null;
        return { chainId, instrument, expiry, depths };
    }

    const ratioKeys = Object.keys(raw).filter((k) => !Number.isNaN(Number(k)));
    if (ratioKeys.length > 0) {
        const depths: Record<string, OrderBookDepth> = {};
        const firstDepth = raw[ratioKeys[0]];
        const primaryDepth = isRecord(firstDepth) ? firstDepth : undefined;

        for (const key of ratioKeys) {
            const depth = raw[key];
            const normalizedDepth = normalizeOrderBookDepth(depth);
            if (!normalizedDepth) return null;
            depths[key] = normalizedDepth;
        }

        const chainId = normalizeOptionalNumber(raw.chainId ?? primaryDepth?.chainId);
        const instrument = normalizeAddress(raw.instrument ?? primaryDepth?.instrument);
        const expiry =
            normalizeOptionalNumber(raw.expiry ?? primaryDepth?.expiry) ??
            normalizeOptionalString(raw.expiry ?? primaryDepth?.expiry);
        if (chainId === undefined || !instrument || expiry === undefined) return null;

        return {
            depths,
            chainId,
            instrument,
            expiry,
        };
    }

    return null;
}

function normalizeOrderBookDepths(value: Record<string, unknown>): Record<string, OrderBookDepth> | null {
    const depths: Record<string, OrderBookDepth> = {};

    for (const [key, depth] of Object.entries(value)) {
        const normalizedDepth = normalizeOrderBookDepth(depth);
        if (!normalizedDepth) return null;
        depths[key] = normalizedDepth;
    }

    return depths;
}

function normalizeOrderBookDepth(value: unknown): OrderBookDepth | null {
    if (!isRecord(value)) return null;
    const bids = normalizeOrderBookLevels(value.bids);
    const asks = normalizeOrderBookLevels(value.asks);
    if (!bids || !asks) return null;

    const blockInfo = normalizeBlockInfo(value.blockInfo);

    return {
        ...(blockInfo ? { blockInfo } : {}),
        bids,
        asks,
    };
}

function normalizeBlockInfo(value: unknown): BlockInfo | undefined {
    if (!isRecord(value)) return undefined;

    const timestamp = normalizeOptionalNumber(value.timestamp);
    const height = normalizeOptionalNumber(value.height);
    if (timestamp === undefined || height === undefined) return undefined;

    return { timestamp, height };
}

function normalizeOrderBookLevels(value: unknown): OrderBookLevel[] | null {
    if (!Array.isArray(value)) return null;

    const levels: OrderBookLevel[] = [];
    for (const item of value) {
        const level = normalizeOrderBookLevel(item);
        if (!level) return null;
        levels.push(level);
    }

    return levels;
}

function normalizeOrderBookLevel(value: unknown): OrderBookLevel | null {
    if (!isRecord(value)) return null;

    const tick = normalizeOptionalNumber(value.tick);
    const { price, baseSize, quoteSize, baseSum, quoteSum } = value;
    if (
        tick === undefined ||
        typeof price !== 'string' ||
        typeof baseSize !== 'string' ||
        typeof quoteSize !== 'string' ||
        typeof baseSum !== 'string' ||
        typeof quoteSum !== 'string'
    ) {
        return null;
    }

    return {
        tick,
        price,
        baseSize,
        quoteSize,
        baseSum,
        quoteSum,
    };
}

export function normalizeTradesStreamData(data: GenericStreamData): TradesStreamData | null {
    if (!data || typeof data !== 'object') return null;
    const record = data;

    const chainId = normalizeOptionalNumber(record.chainId);
    const expiry = normalizeOptionalNumber(record.expiry);
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
        const item = normalizeTradeItem(rawItem, defaults);
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

export function normalizeCommonStreamData(
    data: GenericStreamData,
    stream: string,
    params: CommonSubscribeParams
): MarketListChangedData | BlockNumChangedData | null {
    const chainId = normalizeOptionalNumber(data.chainId) ?? params.chainId;

    if (stream === 'marketListChanged') {
        const items = data.data;
        if (!Array.isArray(items)) return null;
        const normalizedItems = normalizeMarketListItems(items);
        if (!normalizedItems) return null;
        return { chainId, data: normalizedItems };
    }

    if (stream === 'blockNumChanged') {
        const blockNum = normalizeOptionalNumber(data.blockNum);
        if (blockNum === undefined) return null;

        const blockTime = normalizeOptionalNumber(data.blockTime);
        return {
            chainId,
            blockNum,
            ...(blockTime !== undefined ? { blockTime } : {}),
        };
    }

    return null;
}

function normalizeMarketListItems(items: readonly unknown[]): MarketListItem[] | null {
    const normalized: MarketListItem[] = [];

    for (const item of items) {
        if (!isRecord(item)) return null;
        normalized.push(item as MarketListItem);
    }

    return normalized;
}

function normalizeTradeItem(
    data: unknown,
    defaults: { chainId?: number; expiry?: number; instrument?: string }
): TradeItem | null {
    if (!isRecord(data)) return null;
    const record = data;

    const id = record.id;
    const chainId = normalizeOptionalNumber(record.chainId) ?? defaults.chainId;
    const expiry = normalizeOptionalNumber(record.expiry) ?? defaults.expiry;
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
    const timestamp = normalizeOptionalNumber(record.timestamp);
    const txHash = record.txHash;
    const type = record.type;
    const symbol = record.symbol;
    const typeString = record.typeString;
    const side = record.side;
    const event = record.event;
    const markPrice = record.markPrice;
    const fairPrice = record.fairPrice;

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

function normalizeTokenInfo(value: unknown): TradesTokenInfo | null {
    if (!isRecord(value)) return null;

    const token = value;
    const address = token.address;
    const symbol = token.symbol;
    const decimals = normalizeOptionalNumber(token.decimals);
    const image = token.image;
    const price = normalizeOptionalNumber(token.price);

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
        address,
        symbol,
        decimals,
        image,
        price,
    };
}
