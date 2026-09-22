import {
    Condition,
    PairSnapshot,
    type Setting,
    type QuoteParam,
    type Amm,
    type PriceData,
    type Portfolio,
    type QuoteState,
    type SpacingConfig,
    type BlockInfo,
    type Quotation,
    Order,
    Position,
    Range,
} from '../types';
import {
    requireRecord,
    requireArray,
    requireString,
    requireAddress,
    requireNumberValue,
    requireBoolean,
} from './codecs';

export type MinimalPearlTuple = readonly [bigint, bigint];

export function normalizeMinimalPearlTuple(value: unknown): MinimalPearlTuple | null {
    if (Array.isArray(value)) {
        if (value.length < 2) {
            return null;
        }
        const [liquidityNet, left] = value;
        return [toBigIntValue(liquidityNet), toBigIntValue(left)] as const;
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if ('liquidityNet' in record && 'left' in record) {
            return [toBigIntValue(record.liquidityNet), toBigIntValue(record.left)] as const;
        }
        if ('0' in record && '1' in record) {
            return [toBigIntValue(record[0]), toBigIntValue(record[1])] as const;
        }
    }

    return null;
}

export function toBigIntValue(value: unknown): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
        if (Number.isSafeInteger(value)) return BigInt(value);
        throw new Error('Invalid bigint: expected safe integer');
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
        throw new Error('Invalid bigint: expected integer string');
    }
    const text = value.trim();
    const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match) throw new Error('Invalid bigint: expected integer string');
    const [, sign, whole, fraction = '', power = '0'] = match;
    const shift = Number(power) - fraction.length;
    if (!Number.isSafeInteger(shift) || Math.abs(shift) > 1000) throw new Error('Invalid bigint exponent');
    let digits = whole + fraction;
    if (shift < 0) {
        const retained = digits.length + shift;
        if (/[1-9]/.test(digits.slice(Math.max(0, retained)))) throw new Error('Invalid bigint: fractional value');
        digits = retained > 0 ? digits.slice(0, retained) : '0';
    } else {
        digits += '0'.repeat(shift);
    }
    return BigInt(`${sign}${digits}`);
}

function integer(value: unknown, label: string): number {
    const result = requireNumberValue(value, label);
    if (!Number.isSafeInteger(result)) throw new Error(`Invalid ${label}: expected safe integer`);
    return result;
}

function optionalArray(value: unknown, label: string): unknown[] {
    return value == null ? [] : requireArray(value, label);
}

export function buildOnChainContextFromQuery(value: unknown): PairSnapshot {
    const data = requireRecord(value, 'on-chain context');
    const setting = normalizeSettingFromQuery(data.Setting);
    return new PairSnapshot({
        setting,
        condition: integer(data.Condition, 'Condition') as Condition,
        amm: normalizeAmmFromQuery(data.Amm),
        priceData: normalizePriceDataFromQuery(data.PriceData),
        spacing: normalizeSpacingFromQuery(data.Spacing),
        blockInfo: normalizeBlockInfoFromQuery(data.BlockInfo),
        portfolio: data.Portfolio != null ? normalizePortfolioFromQuery(data.Portfolio) : PairSnapshot.emptyPortfolio(),
        quotation: data.Quotation != null ? normalizeQuotationFromQuery(data.Quotation) : undefined,
        quoteState:
            data.QuoteState != null
                ? normalizeQuoteStateFromQuery(data.QuoteState)
                : PairSnapshot.emptyQuoteState(setting.quote, setting.decimals, ''),
    });
}

function normalizeSettingFromQuery(value: unknown): Setting {
    const raw = requireRecord(value, 'Setting');
    const param = requireRecord(raw.Param, 'Setting.Param');
    const fundingHour = integer(raw.FundingHour, 'FundingHour');
    return {
        symbol: requireString(raw, 'Symbol'),
        config: requireAddress(raw, 'Config'),
        gate: requireAddress(raw, 'Gate'),
        market: requireAddress(raw, 'Market'),
        quote: requireAddress(raw, 'Quote'),
        decimals: integer(raw.Decimals, 'Decimals'),
        initialMarginRatio: integer(raw.InitialMarginRatio, 'InitialMarginRatio'),
        maintenanceMarginRatio: integer(raw.MaintenanceMarginRatio, 'MaintenanceMarginRatio'),
        placePaused: requireBoolean(raw, 'PlacePaused'),
        fundingHour,
        disableOrderRebate: requireBoolean(raw, 'DisableOrderRebate'),
        param: {
            minMarginAmount: toBigIntValue(param.MinMarginAmount),
            tradingFeeRatio: integer(param.TradingFeeRatio, 'TradingFeeRatio'),
            protocolFeeRatio: integer(param.ProtocolFeeRatio, 'ProtocolFeeRatio'),
            qtype: integer(param.Qtype, 'Qtype') as QuoteParam['qtype'],
            tip: toBigIntValue(param.Tip),
        },
    };
}

function normalizeAmmFromQuery(value: unknown): Amm {
    const raw = requireRecord(value, 'Amm');
    return {
        expiry: integer(raw.Expiry, 'Expiry'),
        timestamp: integer(raw.Timestamp, 'Timestamp'),
        status: integer(raw.Status, 'Status'),
        tick: integer(raw.Tick, 'Tick'),
        sqrtPX96: toBigIntValue(raw.SqrtPX96),
        liquidity: toBigIntValue(raw.Liquidity),
        totalLiquidity: toBigIntValue(raw.TotalLiquidity),
        totalShort: toBigIntValue(raw.TotalShort),
        openInterests: toBigIntValue(raw.OpenInterests),
        totalLong: toBigIntValue(raw.TotalLong),
        involvedFund: toBigIntValue(raw.InvolvedFund),
        feeIndex: toBigIntValue(raw.FeeIndex),
        protocolFee: toBigIntValue(raw.ProtocolFee),
        longSocialLossIndex: toBigIntValue(raw.LongSocialLossIndex),
        shortSocialLossIndex: toBigIntValue(raw.ShortSocialLossIndex),
        longFundingIndex: toBigIntValue(raw.LongFundingIndex),
        shortFundingIndex: toBigIntValue(raw.ShortFundingIndex),
        insuranceFund: toBigIntValue(raw.InsuranceFund),
        settlementPrice: toBigIntValue(raw.SettlementPrice),
    };
}

function normalizePriceDataFromQuery(value: unknown): PriceData {
    const raw = requireRecord(value, 'PriceData');
    return {
        instrument: requireAddress(raw, 'Instrument'),
        expiry: integer(raw.Expiry, 'Expiry'),
        markPrice: toBigIntValue(raw.MarkPrice),
        spotPrice: toBigIntValue(raw.SpotPrice),
        benchmarkPrice: toBigIntValue(raw.BenchmarkPrice),
        feeder0: requireAddress(raw, 'Feeder0'),
        feeder1: requireAddress(raw, 'Feeder1'),
        feeder0UpdatedAt: toBigIntValue(raw.Feeder0UpdatedAt),
        feeder1UpdatedAt: toBigIntValue(raw.Feeder1UpdatedAt),
    };
}

function normalizePortfolioFromQuery(value: unknown): Portfolio {
    if (value == null) return PairSnapshot.emptyPortfolio();
    const raw = requireRecord(value, 'Portfolio');

    const position = normalizePositionFromQuery(raw.Position);
    const oids = optionalArray(raw.Oids, 'Oids').map((oid) => integer(oid, 'oid'));
    const orders = optionalArray(raw.Orders, 'Orders').map((order, index) => {
        const oid = oids[index];
        if (oid === undefined) {
            throw new Error('Order oid is missing');
        }
        const { tick, nonce } = Order.unpackKey(oid);
        return normalizeOrderFromQuery(order, tick, nonce);
    });
    const rids = optionalArray(raw.Rids, 'Rids').map((rid) => integer(rid, 'rid'));
    const ranges = optionalArray(raw.Ranges, 'Ranges').map((range, index) => {
        const rid = rids[index];
        if (rid === undefined) {
            throw new Error('Range rid is missing');
        }
        const { tickLower, tickUpper } = Range.unpackKey(rid);
        return normalizeRangeFromQuery(range, tickLower, tickUpper);
    });
    const ordersTaken = optionalArray(raw.OrdersTaken, 'OrdersTaken').map(toBigIntValue);
    if (oids.length !== orders.length || rids.length !== ranges.length || ordersTaken.length !== orders.length)
        throw new Error('Portfolio array lengths do not match');

    return {
        oids,
        rids,
        position,
        orders,
        ranges,
        ordersTaken,
    };
}

function normalizePositionFromQuery(value: unknown): Position {
    if (value == null) return Position.empty();
    const raw = requireRecord(value, 'Position');

    return new Position(
        toBigIntValue(raw.Balance),
        toBigIntValue(raw.Size),
        toBigIntValue(raw.EntryNotional),
        toBigIntValue(raw.EntrySocialLossIndex),
        toBigIntValue(raw.EntryFundingIndex)
    );
}

function normalizeOrderFromQuery(value: unknown, tick: number, nonce: number): Order {
    const raw = requireRecord(value, 'Order');
    return new Order(toBigIntValue(raw.Balance), toBigIntValue(raw.Size), tick, nonce);
}

function normalizeRangeFromQuery(value: unknown, tickLower: number, tickUpper: number): Range {
    const raw = requireRecord(value, 'Range');
    return new Range(
        toBigIntValue(raw.Liquidity),
        toBigIntValue(raw.EntryFeeIndex),
        toBigIntValue(raw.Balance),
        toBigIntValue(raw.SqrtEntryPX96),
        tickLower,
        tickUpper
    );
}

function normalizeQuotationFromQuery(value: unknown): Quotation {
    const raw = requireRecord(value, 'Quotation');
    return {
        benchmark: toBigIntValue(raw.Benchmark),
        sqrtFairPX96: toBigIntValue(raw.SqrtFairPX96),
        tick: integer(raw.Tick, 'Tick'),
        mark: toBigIntValue(raw.Mark),
        entryNotional: toBigIntValue(raw.EntryNotional),
        fee: toBigIntValue(raw.Fee),
        minAmount: toBigIntValue(raw.MinAmount),
        sqrtPostFairPX96: toBigIntValue(raw.SqrtPostFairPX96),
        postTick: integer(raw.PostTick, 'PostTick'),
    };
}

function normalizeQuoteStateFromQuery(value: unknown): QuoteState {
    const raw = requireRecord(value, 'QuoteState');
    const flow = raw.FundFlow == null ? undefined : requireRecord(raw.FundFlow, 'FundFlow');
    const pending = raw.Pending == null ? undefined : requireRecord(raw.Pending, 'Pending');
    return {
        quote: requireAddress(raw, 'Quote'),
        decimals: integer(raw.Decimals, 'Decimals'),
        symbol: requireString(raw, 'Symbol'),
        threshold: toBigIntValue(raw.Threshold),
        reserve: toBigIntValue(raw.Reserve),
        balance: toBigIntValue(raw.Balance),
        allowance: toBigIntValue(raw.Allowance),
        fundFlow: {
            totalIn: flow ? toBigIntValue(flow.TotalIn) : 0n,
            totalOut: flow ? toBigIntValue(flow.TotalOut) : 0n,
        },
        pending: {
            timestamp: pending ? integer(pending.Timestamp, 'Timestamp') : 0,
            native: pending ? requireBoolean(pending, 'Native') : false,
            amount: pending ? toBigIntValue(pending.Amount) : 0n,
            exemption: pending ? toBigIntValue(pending.Exemption) : 0n,
        },
    };
}

function normalizeSpacingFromQuery(value: unknown): SpacingConfig {
    const raw = requireRecord(value, 'Spacing');
    return {
        pearl: integer(raw.Pearl, 'Pearl'),
        order: integer(raw.Order, 'Order'),
        range: integer(raw.Range, 'Range'),
    };
}

function normalizeBlockInfoFromQuery(value: unknown): BlockInfo {
    const raw = requireRecord(value, 'BlockInfo');
    return {
        timestamp: integer(raw.Timestamp, 'Timestamp'),
        height: integer(raw.Height, 'Height'),
    };
}
