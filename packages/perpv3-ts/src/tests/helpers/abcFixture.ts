import { Condition } from '../../types';
import { Position } from '../../types/position';
import { Range } from '../../types/range';
import { Order } from '../../types/order';
import {
    type Amm,
    type BlockInfo,
    type Portfolio,
    type PriceData,
    type QuoteState,
    type Quotation,
    type Setting,
    type SpacingConfig,
} from '../../types/contract';
import { PairSnapshot } from '../../types/snapshot';
import { asRecord, recordEntries } from './record';

type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface RawOnchainContext {
    setting: unknown;
    condition?: unknown;
    amm: unknown;
    priceData: unknown;
    portfolio?: unknown;
    quotation?: unknown;
    quoteState?: unknown;
    spacing: unknown;
    blockInfo: unknown;
}

export interface RawQuotation {
    benchmark: JsonPrimitive;
    sqrtFairPX96: JsonPrimitive;
    tick: number;
    mark: JsonPrimitive;
    entryNotional: JsonPrimitive;
    fee: JsonPrimitive;
    minAmount: JsonPrimitive;
    sqrtPostFairPX96: JsonPrimitive;
    postTick: number;
}

export function parseBigInt(value: unknown): bigint {
    if (typeof value === 'bigint') {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        return BigInt(value);
    }
    throw new Error(`Invalid bigint value in fixture: ${String(value)}`);
}

function parseNumber(value: unknown, fallback = 0): number {
    return Number(value ?? fallback);
}

function parseString(value: unknown, fallback = ''): string {
    return String(value ?? fallback);
}

function parseArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function parseTypedString<T extends string>(value: unknown): T {
    return parseString(value) as T;
}

function parsePriceData(raw: unknown): PriceData {
    const record = asRecord(raw);
    return {
        instrument: parseTypedString<PriceData['instrument']>(record.instrument),
        expiry: parseNumber(record.expiry),
        markPrice: parseBigInt(record.markPrice),
        spotPrice: parseBigInt(record.spotPrice),
        benchmarkPrice: parseBigInt(record.benchmarkPrice),
        feeder0: parseTypedString<PriceData['feeder0']>(record.feeder0),
        feeder1: parseTypedString<PriceData['feeder1']>(record.feeder1),
        feeder0UpdatedAt: parseBigInt(record.feeder0UpdatedAt),
        feeder1UpdatedAt: parseBigInt(record.feeder1UpdatedAt),
    };
}

function parseAmm(raw: unknown): Amm {
    const record = asRecord(raw);
    return {
        expiry: parseNumber(record.expiry),
        timestamp: parseNumber(record.timestamp),
        status: parseNumber(record.status),
        tick: parseNumber(record.tick),
        sqrtPX96: parseBigInt(record.sqrtPX96),
        liquidity: parseBigInt(record.liquidity),
        totalLiquidity: parseBigInt(record.totalLiquidity),
        totalShort: parseBigInt(record.totalShort),
        openInterests: parseBigInt(record.openInterests),
        totalLong: parseBigInt(record.totalLong),
        involvedFund: parseBigInt(record.involvedFund),
        feeIndex: parseBigInt(record.feeIndex),
        protocolFee: parseBigInt(record.protocolFee),
        longSocialLossIndex: parseBigInt(record.longSocialLossIndex),
        shortSocialLossIndex: parseBigInt(record.shortSocialLossIndex),
        longFundingIndex: parseBigInt(record.longFundingIndex),
        shortFundingIndex: parseBigInt(record.shortFundingIndex),
        insuranceFund: parseBigInt(record.insuranceFund),
        settlementPrice: parseBigInt(record.settlementPrice),
    };
}

function parsePosition(raw: unknown): Position {
    const record = asRecord(raw);
    return new Position(
        parseBigInt(record.balance),
        parseBigInt(record.size),
        parseBigInt(record.entryNotional),
        parseBigInt(record.entrySocialLossIndex),
        parseBigInt(record.entryFundingIndex)
    );
}

function parseOrder(raw: unknown, tick: number, nonce: number): Order {
    const record = asRecord(raw);
    return new Order(parseBigInt(record.balance), parseBigInt(record.size), tick, nonce);
}

function parseRange(raw: unknown, tickLower: number, tickUpper: number): Range {
    const record = asRecord(raw);
    return new Range(
        parseBigInt(record.liquidity),
        parseBigInt(record.entryFeeIndex),
        parseBigInt(record.balance),
        parseBigInt(record.sqrtEntryPX96),
        tickLower,
        tickUpper
    );
}

function parsePortfolio(raw: unknown): Portfolio {
    const record = asRecord(raw);
    const position = parsePosition(record.position);
    const oids = parseArray(record.oids).map((oid) => parseNumber(oid));
    const orders = parseArray(record.orders).map((order, index) => {
        const oid = oids[index];
        if (oid === undefined) {
            throw new Error('Order oid is missing');
        }
        const { tick, nonce } = Order.unpackKey(oid);
        return parseOrder(order, tick, nonce);
    });
    const rids = parseArray(record.rids).map((rid) => parseNumber(rid));
    const ranges = parseArray(record.ranges).map((range, index) => {
        const rid = rids[index];
        if (rid === undefined) {
            throw new Error('Range rid is missing');
        }
        const { tickLower, tickUpper } = Range.unpackKey(rid);
        return parseRange(range, tickLower, tickUpper);
    });
    const ordersTaken = parseArray(record.ordersTaken).map((item) => parseBigInt(item));

    return {
        oids,
        rids,
        position,
        orders,
        ranges,
        ordersTaken,
    };
}

function parseQuoteState(raw: unknown): QuoteState {
    const record = asRecord(raw);
    const fundFlow = asRecord(record.fundFlow);
    const pending = asRecord(record.pending);
    return {
        quote: parseTypedString<QuoteState['quote']>(record.quote),
        decimals: parseNumber(record.decimals),
        symbol: parseString(record.symbol),
        threshold: parseBigInt(record.threshold),
        reserve: parseBigInt(record.reserve),
        balance: parseBigInt(record.balance),
        allowance: parseBigInt(record.allowance),
        fundFlow: {
            totalIn: parseBigInt(fundFlow.totalIn),
            totalOut: parseBigInt(fundFlow.totalOut),
        },
        pending: {
            timestamp: parseNumber(pending.timestamp),
            native: Boolean(pending.native),
            amount: parseBigInt(pending.amount),
            exemption: parseBigInt(pending.exemption),
        },
    };
}

function parseSpacing(raw: unknown): SpacingConfig {
    const record = asRecord(raw);
    return {
        pearl: parseNumber(record.pearl),
        order: parseNumber(record.order),
        range: parseNumber(record.range),
    };
}

function parseBlockInfo(raw: unknown): BlockInfo {
    const record = asRecord(raw);
    return {
        timestamp: parseNumber(record.timestamp),
        height: parseNumber(record.height),
    };
}

export function parseQuotation(raw: unknown): Quotation {
    const record = asRecord(raw);
    return {
        benchmark: parseBigInt(record.benchmark),
        sqrtFairPX96: parseBigInt(record.sqrtFairPX96),
        tick: parseNumber(record.tick),
        mark: parseBigInt(record.mark),
        entryNotional: parseBigInt(record.entryNotional),
        fee: parseBigInt(record.fee),
        minAmount: parseBigInt(record.minAmount),
        sqrtPostFairPX96: parseBigInt(record.sqrtPostFairPX96),
        postTick: parseNumber(record.postTick),
    };
}

export function parseOnchainContext(raw: unknown): PairSnapshot {
    const record = asRecord(raw);
    const settingRaw = asRecord(record.setting);
    const priceDataRaw = record.priceData;
    const ammRaw = record.amm;
    const portfolioRaw = record.portfolio;
    const quoteStateRaw = record.quoteState;
    const spacingRaw = record.spacing;
    const blockInfoRaw = record.blockInfo;
    const paramRaw = asRecord(settingRaw.param);

    const setting = {
        symbol: parseString(settingRaw.symbol),
        config: parseTypedString<Setting['config']>(settingRaw.config),
        gate: parseTypedString<Setting['gate']>(settingRaw.gate),
        market: parseTypedString<Setting['market']>(settingRaw.market),
        quote: parseTypedString<Setting['quote']>(settingRaw.quote),
        decimals: parseNumber(settingRaw.decimals),
        initialMarginRatio: parseNumber(settingRaw.initialMarginRatio),
        maintenanceMarginRatio: parseNumber(settingRaw.maintenanceMarginRatio),
        placePaused: Boolean(settingRaw.placePaused),
        fundingHour: parseNumber(settingRaw.fundingHour),
        disableOrderRebate: Boolean(settingRaw.disableOrderRebate),
        param: {
            minMarginAmount: parseBigInt(paramRaw.minMarginAmount),
            tradingFeeRatio: parseNumber(paramRaw.tradingFeeRatio),
            protocolFeeRatio: parseNumber(paramRaw.protocolFeeRatio),
            qtype: parseNumber(paramRaw.qtype),
            tip: parseBigInt(paramRaw.tip),
        },
    };

    const portfolio = portfolioRaw ? parsePortfolio(portfolioRaw) : PairSnapshot.emptyPortfolio();
    const quoteState = quoteStateRaw
        ? parseQuoteState(quoteStateRaw)
        : PairSnapshot.emptyQuoteState(setting.quote, setting.decimals, '');
    const quotation = record.quotation ? parseQuotation(record.quotation) : undefined;

    return new PairSnapshot({
        setting,
        condition: record.condition !== undefined ? (parseNumber(record.condition) as Condition) : Condition.NORMAL,
        amm: parseAmm(ammRaw),
        priceData: parsePriceData(priceDataRaw),
        spacing: parseSpacing(spacingRaw),
        blockInfo: parseBlockInfo(blockInfoRaw),
        portfolio,
        quotation,
        quoteState,
    });
}

export function normalizeBigIntObject<T>(value: T): T {
    return normalizeBigIntInternal(value) as T;
}

function normalizeBigIntInternal(value: unknown): unknown {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeBigIntInternal(item));
    }
    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, entry] of recordEntries(value)) {
            result[key] = normalizeBigIntInternal(entry);
        }
        return result;
    }
    return value;
}
