import type {
    FetchMmAccountTransactionHistoryResponse,
    FetchTradeHistoryResponse,
    FetchMmFundingHistoryResponse,
    FetchMmKlineResponse,
    FetchFuturesPairKlineChartResponse,
    FetchMmLiquidityHistoryResponse,
    FetchMmLiquidityListResponse,
    FetchMmOrderHistoryResponse,
    FetchMmOrderRealtimeResponse,
    FetchTokenCoinsWithSymbolResponse,
    TokenInfoFromApi,
} from './interfaces';
import type {
    AmmFromApi,
    ChartLiquidityDetailsFromApi,
    FetchFuturesInstrumentResponse,
    FetchGateBalanceResponse,
    FetchMmInstrumentInfoItem,
    FetchMmInstrumentInfoResponse,
    FetchMmPositionListResponse,
    FetchMmWalletBalanceResponse,
    FetchMmTicker,
    FetchPortfolioListFromApiResponse,
    GateBalanceInfoFromApi,
    IFuturesOrderBookAllSteps,
    InstrumentFromApi,
    MarketFromApi,
    MmPendingBalance,
    MmPositionFromApi,
    MmWalletPortfolio,
    OrderDataFromApi,
    OrderFromApi,
    PortfolioFromApi,
    PositionFromApi,
    PriceDataFromApi,
    QuotationFromApi,
    QuoteStateFromApi,
    RangeFromApi,
    SettingFromApi,
    TokenInfo,
} from './interfaces';
import {
    optionalNumber,
    optionalString,
    requireAddress,
    requireArray,
    requireNullableArray,
    requireBigInt,
    requireBoolean,
    requireEnumMember,
    requireNumber,
    requireNumberValue,
    requireRecord,
    requireString,
    type UnknownRecord,
} from './codecs';
import { normalizeMinimalPearlTuple } from './utils';
import { Condition, QuoteType, Side, Status, type BlockInfo, type MinimalPearl } from '../types';

function decodeCondition(record: UnknownRecord, key: string, label: string): Condition {
    return requireEnumMember<Condition>(Condition, requireNumber(record, key, label), label);
}

function decodeSide(record: UnknownRecord, key: string, label: string): Side {
    return requireEnumMember<Side>(Side, requireNumber(record, key, label), label);
}

function decodeBlockInfo(value: unknown, label: string): BlockInfo {
    const record = requireRecord(value, label);
    return {
        timestamp: requireNumber(record, 'timestamp', `${label}.timestamp`),
        height: requireNumber(record, 'height', `${label}.height`),
    };
}

function decodeTokenInfo(value: unknown, label: string): TokenInfo {
    const record = requireRecord(value, label);
    const token: TokenInfo = {
        address: requireAddress(record, 'address', `${label}.address`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
        decimals: requireNumber(record, 'decimals', `${label}.decimals`),
    };
    const name = optionalString(record, 'name', `${label}.name`);
    if (name !== undefined) {
        token.name = name;
    }
    return token;
}

function decodeSetting(value: unknown, label: string): SettingFromApi {
    const record = requireRecord(value, label);
    const quoteParam = requireRecord(record.quoteParam, `${label}.quoteParam`);
    return {
        initialMarginRatio: requireNumber(record, 'initialMarginRatio', `${label}.initialMarginRatio`),
        maintenanceMarginRatio: requireNumber(record, 'maintenanceMarginRatio', `${label}.maintenanceMarginRatio`),
        quoteParam: {
            minMarginAmount: requireBigInt(quoteParam, 'minMarginAmount', `${label}.quoteParam.minMarginAmount`),
            tradingFeeRatio: requireNumber(quoteParam, 'tradingFeeRatio', `${label}.quoteParam.tradingFeeRatio`),
            protocolFeeRatio: requireNumber(quoteParam, 'protocolFeeRatio', `${label}.quoteParam.protocolFeeRatio`),
            qtype: requireEnumMember<QuoteType>(
                QuoteType,
                requireNumber(quoteParam, 'qtype', `${label}.quoteParam.qtype`),
                `${label}.quoteParam.qtype`
            ),
            tip: requireBigInt(quoteParam, 'tip', `${label}.quoteParam.tip`),
        },
    };
}

function decodeFeederSource(value: unknown, label: string): MarketFromApi['config']['feederSource'] {
    return requireNullableArray(value, label).map((item, index) => {
        const itemLabel = `${label}[${index}]`;
        const record = requireRecord(item, itemLabel);
        return {
            aggregator0: requireAddress(record, 'aggregator0', `${itemLabel}.aggregator0`),
            aggregator1: requireAddress(record, 'aggregator1', `${itemLabel}.aggregator1`),
            baseSymbol: requireString(record, 'baseSymbol', `${itemLabel}.baseSymbol`),
            ftype: requireNumber(record, 'ftype', `${itemLabel}.ftype`),
            heartBeat0: requireNumber(record, 'heartBeat0', `${itemLabel}.heartBeat0`),
            heartBeat1: requireNumber(record, 'heartBeat1', `${itemLabel}.heartBeat1`),
            quoteSymbol: requireString(record, 'quoteSymbol', `${itemLabel}.quoteSymbol`),
        };
    });
}

function decodeMarket(value: unknown, label: string): MarketFromApi {
    const record = requireRecord(value, label);
    const config = requireRecord(record.config, `${label}.config`);
    const info = requireRecord(record.info, `${label}.info`);
    const feederValue = record.feeder;
    const feeder =
        feederValue === null
            ? null
            : (() => {
                  const feederRecord = requireRecord(feederValue, `${label}.feeder`);
                  return {
                      aggregator0: requireAddress(feederRecord, 'aggregator0', `${label}.feeder.aggregator0`),
                      aggregator1: requireAddress(feederRecord, 'aggregator1', `${label}.feeder.aggregator1`),
                      ftype: requireNumber(feederRecord, 'ftype', `${label}.feeder.ftype`),
                      heartBeat0: requireNumber(feederRecord, 'heartBeat0', `${label}.feeder.heartBeat0`),
                      heartBeat1: requireNumber(feederRecord, 'heartBeat1', `${label}.feeder.heartBeat1`),
                      scaler0: requireBigInt(feederRecord, 'scaler0', `${label}.feeder.scaler0`),
                      scaler1: requireBigInt(feederRecord, 'scaler1', `${label}.feeder.scaler1`),
                  };
              })();

    return {
        config: {
            dailyInterestRate: requireNumber(config, 'dailyInterestRate', `${label}.config.dailyInterestRate`),
            feederSource: decodeFeederSource(config.feederSource, `${label}.config.feederSource`),
        },
        feeder,
        info: {
            addr: requireAddress(info, 'addr', `${label}.info.addr`),
            // The server sends an empty string for markets without a beacon.
            ...(info.beacon !== '' && { beacon: requireAddress(info, 'beacon', `${label}.info.beacon`) }),
            type: requireString(info, 'type', `${label}.info.type`),
        },
    };
}

function decodeAmm(value: unknown, label: string): AmmFromApi {
    const record = requireRecord(value, label);
    return {
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        timestamp: requireNumber(record, 'timestamp', `${label}.timestamp`),
        status: requireEnumMember<Status>(
            Status,
            requireNumber(record, 'status', `${label}.status`),
            `${label}.status`
        ),
        tick: requireNumber(record, 'tick', `${label}.tick`),
        sqrtPX96: requireBigInt(record, 'sqrtPX96', `${label}.sqrtPX96`),
        liquidity: requireBigInt(record, 'liquidity', `${label}.liquidity`),
        totalLiquidity: requireBigInt(record, 'totalLiquidity', `${label}.totalLiquidity`),
        totalShort: requireBigInt(record, 'totalShort', `${label}.totalShort`),
        openInterests: requireBigInt(record, 'openInterests', `${label}.openInterests`),
        totalLong: requireBigInt(record, 'totalLong', `${label}.totalLong`),
        involvedFund: requireBigInt(record, 'involvedFund', `${label}.involvedFund`),
        feeIndex: requireBigInt(record, 'feeIndex', `${label}.feeIndex`),
        protocolFee: requireBigInt(record, 'protocolFee', `${label}.protocolFee`),
        longSocialLossIndex: requireBigInt(record, 'longSocialLossIndex', `${label}.longSocialLossIndex`),
        shortSocialLossIndex: requireBigInt(record, 'shortSocialLossIndex', `${label}.shortSocialLossIndex`),
        longFundingIndex: requireBigInt(record, 'longFundingIndex', `${label}.longFundingIndex`),
        shortFundingIndex: requireBigInt(record, 'shortFundingIndex', `${label}.shortFundingIndex`),
        insuranceFund: requireBigInt(record, 'insuranceFund', `${label}.insuranceFund`),
        settlementPrice: requireBigInt(record, 'settlementPrice', `${label}.settlementPrice`),
        blockInfo: decodeBlockInfo(record.blockInfo, `${label}.blockInfo`),
        fairPrice: requireBigInt(record, 'fairPrice', `${label}.fairPrice`),
        instrumentAddr: requireAddress(record, 'instrumentAddr', `${label}.instrumentAddr`),
        markPrice: requireBigInt(record, 'markPrice', `${label}.markPrice`),
    };
}

function decodeInstrument(value: unknown, label: string): InstrumentFromApi {
    const record = requireRecord(value, label);
    const instrumentAddr = requireAddress(record, 'instrumentAddr', `${label}.instrumentAddr`);
    return {
        amms: requireNullableArray(record.amms, `${label}.amms`).map((amm, index) =>
            decodeAmm(amm, `${label}.amms[${index}]`)
        ),
        base: decodeTokenInfo(record.base, `${label}.base`),
        blockInfo: decodeBlockInfo(record.blockInfo, `${label}.blockInfo`),
        condition: decodeCondition(record, 'condition', `${label}.condition`),
        disableOrderRebate: requireBoolean(record, 'disableOrderRebate', `${label}.disableOrderRebate`),
        displayBase: decodeTokenInfo(record.displayBase, `${label}.displayBase`),
        displayQuote: decodeTokenInfo(record.displayQuote, `${label}.displayQuote`),
        fundingHour: requireNumber(record, 'fundingHour', `${label}.fundingHour`),
        instrumentAddr,
        instrumentType: requireNumber(record, 'instrumentType', `${label}.instrumentType`),
        market: decodeMarket(record.market, `${label}.market`),
        marketType: requireString(record, 'marketType', `${label}.marketType`),
        minOrderValue: requireBigInt(record, 'minOrderValue', `${label}.minOrderValue`),
        minRangeValue: requireBigInt(record, 'minRangeValue', `${label}.minRangeValue`),
        minTickDelta: requireNumber(record, 'minTickDelta', `${label}.minTickDelta`),
        minTradeValue: requireBigInt(record, 'minTradeValue', `${label}.minTradeValue`),
        placePaused: requireBoolean(record, 'placePaused', `${label}.placePaused`),
        quote: decodeTokenInfo(record.quote, `${label}.quote`),
        setting: decodeSetting(record.setting, `${label}.setting`),
        spotPrice: requireBigInt(record, 'spotPrice', `${label}.spotPrice`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
    };
}

export function decodeFuturesInstrument(value: unknown): FetchFuturesInstrumentResponse {
    return value === null ? null : decodeInstrument(value, 'futures instrument');
}

function decodePosition(value: unknown, label: string): PositionFromApi {
    const record = requireRecord(value, label);
    return {
        balance: requireBigInt(record, 'balance', `${label}.balance`),
        size: requireBigInt(record, 'size', `${label}.size`),
        entryNotional: requireBigInt(record, 'entryNotional', `${label}.entryNotional`),
        entrySocialLossIndex: requireBigInt(record, 'entrySocialLossIndex', `${label}.entrySocialLossIndex`),
        entryFundingIndex: requireBigInt(record, 'entryFundingIndex', `${label}.entryFundingIndex`),
        entryPrice: requireBigInt(record, 'entryPrice', `${label}.entryPrice`),
        side: decodeSide(record, 'side', `${label}.side`),
    };
}

function decodeOrder(value: unknown, label: string): OrderFromApi {
    const record = requireRecord(value, label);
    return {
        balance: requireBigInt(record, 'balance', `${label}.balance`),
        size: requireBigInt(record, 'size', `${label}.size`),
        tick: requireNumber(record, 'tick', `${label}.tick`),
        nonce: requireNumber(record, 'nonce', `${label}.nonce`),
        oid: requireNumber(record, 'oid', `${label}.oid`),
        side: decodeSide(record, 'side', `${label}.side`),
        taken: requireBigInt(record, 'taken', `${label}.taken`),
        limitPrice: requireBigInt(record, 'limitPrice', `${label}.limitPrice`),
    };
}

function decodeRange(value: unknown, label: string): RangeFromApi {
    const record = requireRecord(value, label);
    return {
        liquidity: requireBigInt(record, 'liquidity', `${label}.liquidity`),
        entryFeeIndex: requireBigInt(record, 'entryFeeIndex', `${label}.entryFeeIndex`),
        balance: requireBigInt(record, 'balance', `${label}.balance`),
        sqrtEntryPX96: requireBigInt(record, 'sqrtEntryPX96', `${label}.sqrtEntryPX96`),
        tickLower: requireNumber(record, 'tickLower', `${label}.tickLower`),
        tickUpper: requireNumber(record, 'tickUpper', `${label}.tickUpper`),
        entryPrice: requireBigInt(record, 'entryPrice', `${label}.entryPrice`),
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        instrumentAddr: requireAddress(record, 'instrumentAddr', `${label}.instrumentAddr`),
        lowerPrice: requireBigInt(record, 'lowerPrice', `${label}.lowerPrice`),
        rid: requireNumber(record, 'rid', `${label}.rid`),
        traderAddr: requireAddress(record, 'traderAddr', `${label}.traderAddr`),
        upperPrice: requireBigInt(record, 'upperPrice', `${label}.upperPrice`),
    };
}

function decodePortfolioPosition(value: unknown, label: string): PositionFromApi | undefined {
    const record = requireRecord(value, label);
    // Without a position the server sends its zero-valued struct, whose numeric strings are empty.
    return record.balance === '' && record.size === '' ? undefined : decodePosition(record, label);
}

function decodePortfolio(value: unknown, label: string): PortfolioFromApi {
    const record = requireRecord(value, label);
    return {
        blockInfo: decodeBlockInfo(record.blockInfo, `${label}.blockInfo`),
        instrumentAddr: requireAddress(record, 'instrumentAddr', `${label}.instrumentAddr`),
        traderAddr: requireAddress(record, 'traderAddr', `${label}.traderAddr`),
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        position: decodePortfolioPosition(record.position, `${label}.position`),
        orders: requireArray(record.orders, `${label}.orders`).map((order, index) =>
            decodeOrder(order, `${label}.orders[${index}]`)
        ),
        ranges: requireArray(record.ranges, `${label}.ranges`).map((range, index) =>
            decodeRange(range, `${label}.ranges[${index}]`)
        ),
    };
}

export function decodePortfolioList(value: unknown): FetchPortfolioListFromApiResponse {
    const label = 'portfolio list';
    const record = requireRecord(value, label);
    return {
        address: requireAddress(record, 'address', `${label}.address`),
        instruments: requireNullableArray(record.instruments, `${label}.instruments`).map((instrument, index) =>
            decodeInstrument(instrument, `${label}.instruments[${index}]`)
        ),
        portfolios: requireNullableArray(record.portfolios, `${label}.portfolios`).map((portfolio, index) =>
            decodePortfolio(portfolio, `${label}.portfolios[${index}]`)
        ),
    };
}

export function decodePriceData(value: unknown): PriceDataFromApi {
    const label = 'price data';
    const record = requireRecord(value, label);
    return {
        instrumentAddr: requireAddress(record, 'instrumentAddr', `${label}.instrumentAddr`),
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        markPrice: requireBigInt(record, 'markPrice', `${label}.markPrice`),
        spotPrice: requireBigInt(record, 'spotPrice', `${label}.spotPrice`),
        benchmarkPrice: requireBigInt(record, 'benchmarkPrice', `${label}.benchmarkPrice`),
        feeder0: requireAddress(record, 'feeder0', `${label}.feeder0`),
        feeder1: requireAddress(record, 'feeder1', `${label}.feeder1`),
        feeder0UpdatedAt: requireBigInt(record, 'feeder0UpdatedAt', `${label}.feeder0UpdatedAt`),
        feeder1UpdatedAt: requireBigInt(record, 'feeder1UpdatedAt', `${label}.feeder1UpdatedAt`),
        blockInfo: decodeBlockInfo(record.blockInfo, `${label}.blockInfo`),
    };
}

export function decodeQuoteState(value: unknown): QuoteStateFromApi {
    const label = 'quote state';
    const record = requireRecord(value, label);
    const fundFlow = requireRecord(record.fundFlow, `${label}.fundFlow`);
    const pending = requireRecord(record.pending, `${label}.pending`);
    return {
        address: requireAddress(record, 'address', `${label}.address`),
        decimals: requireNumber(record, 'decimals', `${label}.decimals`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
        threshold: requireBigInt(record, 'threshold', `${label}.threshold`),
        reserve: requireBigInt(record, 'reserve', `${label}.reserve`),
        balance: requireBigInt(record, 'balance', `${label}.balance`),
        allowance: requireBigInt(record, 'allowance', `${label}.allowance`),
        fundFlow: {
            totalIn: requireBigInt(fundFlow, 'totalIn', `${label}.fundFlow.totalIn`),
            totalOut: requireBigInt(fundFlow, 'totalOut', `${label}.fundFlow.totalOut`),
        },
        pending: {
            timestamp: requireNumber(pending, 'timestamp', `${label}.pending.timestamp`),
            native: requireBoolean(pending, 'native', `${label}.pending.native`),
            amount: requireBigInt(pending, 'amount', `${label}.pending.amount`),
            exemption: requireBigInt(pending, 'exemption', `${label}.pending.exemption`),
        },
    };
}

export function decodeQuotation(value: unknown): QuotationFromApi {
    const record = requireRecord(value, 'quotation');
    return {
        benchmark: requireBigInt(record, 'benchmark'),
        sqrtFairPX96: requireBigInt(record, 'sqrtFairPX96'),
        tick: requireNumber(record, 'tick'),
        mark: requireBigInt(record, 'mark'),
        entryNotional: requireBigInt(record, 'entryNotional'),
        fee: requireBigInt(record, 'fee'),
        minAmount: requireBigInt(record, 'minAmount'),
        sqrtPostFairPX96: requireBigInt(record, 'sqrtPostFairPX96'),
        postTick: requireNumber(record, 'postTick'),
    };
}

export function decodeQuotationWithSize(value: unknown): QuotationFromApi {
    const record = requireRecord(value, 'quotation');
    return { ...decodeQuotation(record), size: requireBigInt(record, 'size') };
}

export function decodeOrderBookSteps(value: unknown): IFuturesOrderBookAllSteps {
    const record = requireRecord(value, 'order book');
    return Object.entries(record).reduce<IFuturesOrderBookAllSteps>((acc, [key, depthValue]) => {
        const label = `order book ${key}`;
        const depth = requireRecord(depthValue, label);
        const bids = decodeOrderBookSide(depth.bids, `${label}.bids`).sort((a, b) => b.tick - a.tick);
        const asks = decodeOrderBookSide(depth.asks, `${label}.asks`).sort((a, b) => a.tick - b.tick);

        acc[key] = { asks, bids };
        return acc;
    }, {});
}

function decodeOrderBookSide(value: unknown, label: string): OrderDataFromApi[] {
    return requireNullableArray(value, label).map((item, index) => {
        const itemLabel = `${label}[${index}]`;
        const record = requireRecord(item, itemLabel);
        return {
            // The wire field is `baseSize`; the domain level shares `baseQuantity` with the RPC depth path.
            baseQuantity: requireBigInt(record, 'baseSize', `${itemLabel}.baseSize`),
            baseSum: requireBigInt(record, 'baseSum', `${itemLabel}.baseSum`),
            price: requireBigInt(record, 'price', `${itemLabel}.price`),
            quoteSize: requireBigInt(record, 'quoteSize', `${itemLabel}.quoteSize`),
            quoteSum: requireBigInt(record, 'quoteSum', `${itemLabel}.quoteSum`),
            tick: requireNumber(record, 'tick', `${itemLabel}.tick`),
        };
    });
}

export function decodeMmTickers(value: unknown): FetchMmTicker[] {
    // The symbol-filtered endpoint returns one object; the unfiltered endpoint returns an array.
    return (Array.isArray(value) ? value : [value]).map((item, index) => {
        const record = requireRecord(item, `MM ticker.${index}`);
        return {
            closeTime24h: requireNumber(record, 'closeTime24h', `MM ticker.${index}.closeTime24h`),
            expiry: requireNumber(record, 'expiry', `MM ticker.${index}.expiry`),
            fundingRate: requireString(record, 'fundingRate', `MM ticker.${index}.fundingRate`),
            highPrice24h: requireNumber(record, 'highPrice24h', `MM ticker.${index}.highPrice24h`),
            instrumentAddress: requireAddress(record, 'instrumentAddress', `MM ticker.${index}.instrumentAddress`),
            lastPrice: requireString(record, 'lastPrice', `MM ticker.${index}.lastPrice`),
            lowPrice24h: requireNumber(record, 'lowPrice24h', `MM ticker.${index}.lowPrice24h`),
            markPrice: requireString(record, 'markPrice', `MM ticker.${index}.markPrice`),
            openInterest: requireString(record, 'openInterest', `MM ticker.${index}.openInterest`),
            openPrice24h: requireNumber(record, 'openPrice24h', `MM ticker.${index}.openPrice24h`),
            openTime24h: requireNumber(record, 'openTime24h', `MM ticker.${index}.openTime24h`),
            priceChange24H: requireString(record, 'priceChange24H', `MM ticker.${index}.priceChange24H`),
            priceChangePercent24h: requireString(
                record,
                'priceChangePercent24h',
                `MM ticker.${index}.priceChangePercent24h`
            ),
            quoteVolume24h: requireString(record, 'quoteVolume24h', `MM ticker.${index}.quoteVolume24h`),
            spotPrice: requireString(record, 'spotPrice', `MM ticker.${index}.spotPrice`),
            symbol: requireString(record, 'symbol', `MM ticker.${index}.symbol`),
            timestamp: requireNumber(record, 'timestamp', `MM ticker.${index}.timestamp`),
            volume24h: requireString(record, 'volume24h', `MM ticker.${index}.volume24h`),
        };
    });
}

export function decodeMmWalletBalance(value: unknown): FetchMmWalletBalanceResponse {
    const label = 'MM wallet balance';
    const record = requireRecord(value, label);
    return {
        address: requireAddress(record, 'address', `${label}.address`),
        portfolios: decodeMmWalletPortfolios(record.portfolios),
        isBlacklisted: requireBoolean(record, 'isBlacklisted', `${label}.isBlacklisted`),
        pendingDuration: requireBigInt(record, 'pendingDuration', `${label}.pendingDuration`),
    };
}

function decodeMmWalletPortfolios(value: unknown): MmWalletPortfolio[] {
    return requireNullableArray(value, 'MM wallet portfolios').map(decodeMmWalletPortfolio);
}

function decodeMmWalletPortfolio(value: unknown): MmWalletPortfolio {
    const label = 'MM wallet portfolio';
    const record = requireRecord(value, label);
    const portfolio: MmWalletPortfolio = {
        quote: requireAddress(record, 'quote', `${label}.quote`),
        decimals: requireNumber(record, 'decimals', `${label}.decimals`),
        balance: requireBigInt(record, 'balance', `${label}.balance`),
        pendingBalance: decodeMmPendingBalance(record.pendingBalance),
        totalInBalance: requireBigInt(record, 'totalInBalance', `${label}.totalInBalance`),
        totalOutBalance: requireBigInt(record, 'totalOutBalance', `${label}.totalOutBalance`),
        reservedBalance: requireBigInt(record, 'reservedBalance', `${label}.reservedBalance`),
        thresholdBalance: requireBigInt(record, 'thresholdBalance', `${label}.thresholdBalance`),
        maxWithdrawable: requireBigInt(record, 'maxWithdrawable', `${label}.maxWithdrawable`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
    };
    const imageUrl = optionalString(record, 'imageUrl', `${label}.imageUrl`);
    if (imageUrl !== undefined) {
        portfolio.imageUrl = imageUrl;
    }
    const currentPrice = optionalNumber(record, 'currentPrice', `${label}.currentPrice`);
    if (currentPrice !== undefined) {
        portfolio.currentPrice = currentPrice;
    }
    return portfolio;
}

function decodeMmPendingBalance(value: unknown): MmPendingBalance {
    const label = 'MM pending balance';
    const record = requireRecord(value, label);
    return {
        timestamp: requireNumber(record, 'timestamp', `${label}.timestamp`),
        native: requireBoolean(record, 'native', `${label}.native`),
        amount: requireBigInt(record, 'amount', `${label}.amount`),
        exemption: requireBigInt(record, 'exemption', `${label}.exemption`),
    };
}

export function decodeMmPositionList(value: unknown): FetchMmPositionListResponse {
    return requireArray(value, 'MM position list').map(decodeMmPosition);
}

function decodeMmPosition(value: unknown): MmPositionFromApi {
    const label = 'MM position';
    const record = requireRecord(value, label);
    return {
        balance: requireBigInt(record, 'balance', `${label}.balance`),
        size: requireBigInt(record, 'size', `${label}.size`),
        entryNotional: requireBigInt(record, 'entryNotional', `${label}.entryNotional`),
        entrySocialLossIndex: requireBigInt(record, 'entrySocialLossIndex', `${label}.entrySocialLossIndex`),
        entryFundingIndex: requireBigInt(record, 'entryFundingIndex', `${label}.entryFundingIndex`),
        side: requireNumber(record, 'side', `${label}.side`),
        entryPrice: requireBigInt(record, 'entryPrice', `${label}.entryPrice`),
        lastUpdateTime: requireNumber(record, 'lastUpdateTime', `${label}.lastUpdateTime`),
        lastUpdateTxHash: requireString(record, 'lastUpdateTxHash', `${label}.lastUpdateTxHash`),
        instrumentAddr: requireAddress(record, 'instrumentAddr', `${label}.instrumentAddr`),
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
    };
}

export function decodeGateBalances(value: unknown): FetchGateBalanceResponse {
    return requireNullableArray(value, 'gate balances').map((item, index) =>
        decodeGateBalance(item, `gate balances[${index}]`)
    );
}

function decodeGateBalance(value: unknown, label: string): GateBalanceInfoFromApi {
    const record = requireRecord(value, label);
    const pendingBalance = requireRecord(record.pendingBalance, `${label}.pendingBalance`);
    return {
        quote: requireAddress(record, 'quote', `${label}.quote`),
        decimals: requireNumber(record, 'decimals', `${label}.decimals`),
        balance: requireBigInt(record, 'balance', `${label}.balance`),
        pendingBalance: {
            amount: requireBigInt(pendingBalance, 'amount', `${label}.pendingBalance.amount`),
            exemption: requireBigInt(pendingBalance, 'exemption', `${label}.pendingBalance.exemption`),
        },
        totalInBalance: requireBigInt(record, 'totalInBalance', `${label}.totalInBalance`),
        totalOutBalance: requireBigInt(record, 'totalOutBalance', `${label}.totalOutBalance`),
    };
}

function decodeMinimalPearl(value: unknown, label: string): MinimalPearl {
    const pearlTuple = normalizeMinimalPearlTuple(value);
    if (!pearlTuple) {
        throw new Error(`Invalid ${label}: expected pearl`);
    }
    const [liquidityNet, left] = pearlTuple;
    return { liquidityNet, left };
}

export function decodeDepthChartLiquidityDetails(value: unknown): ChartLiquidityDetailsFromApi {
    const label = 'depth chart liquidity details';
    const record = requireRecord(value, label);
    const amm = requireRecord(record.amm, `${label}.amm`);
    const tick2Pearl = Object.entries(requireRecord(record.tick2Pearl, `${label}.tick2Pearl`)).reduce(
        (acc, [key, entry]) => {
            acc.set(
                requireNumberValue(key, `${label}.tick2Pearl key`),
                decodeMinimalPearl(entry, `${label}.tick2Pearl.${key}`)
            );
            return acc;
        },
        new Map<number, MinimalPearl>()
    );

    return {
        amm: {
            liquidity: requireBigInt(amm, 'liquidity', `${label}.amm.liquidity`),
            sqrtPX96: requireBigInt(amm, 'sqrtPX96', `${label}.amm.sqrtPX96`),
            tick: requireNumber(amm, 'tick', `${label}.amm.tick`),
        },
        blockInfo: decodeBlockInfo(record.blockInfo, `${label}.blockInfo`),
        length: requireNumber(record, 'length', `${label}.length`),
        pearls: requireArray(record.pearls, `${label}.pearls`).map((pearl, index) =>
            decodeMinimalPearl(pearl, `${label}.pearls[${index}]`)
        ),
        size: requireNumber(record, 'size', `${label}.size`),
        stepRatio: requireNumber(record, 'stepRatio', `${label}.stepRatio`),
        tick2Pearl,
        tickDelta: requireNumber(record, 'tickDelta', `${label}.tickDelta`),
        tids: requireNullableArray(record.tids, `${label}.tids`).map((tid, index) =>
            requireNumberValue(tid, `${label}.tids[${index}]`)
        ),
    };
}

export function decodeMmInstrumentInfoList(value: unknown): FetchMmInstrumentInfoResponse {
    return requireArray(value, 'MM instrument info list').map((item, index) =>
        decodeMmInstrumentInfo(item, `MM instrument info list[${index}]`)
    );
}

function decodeMmInstrumentInfo(value: unknown, label: string): FetchMmInstrumentInfoItem {
    const record = requireRecord(value, label);
    const base = requireRecord(record.base, `${label}.base`);
    const market = requireRecord(record.market, `${label}.market`);
    return {
        base: {
            symbol: requireString(base, 'symbol', `${label}.base.symbol`),
        },
        disableMakerOrderRebate: requireBoolean(record, 'disableMakerOrderRebate', `${label}.disableMakerOrderRebate`),
        fundingIntervalHour: requireNumber(record, 'fundingIntervalHour', `${label}.fundingIntervalHour`),
        initialMarginRatio: requireNumber(record, 'initialMarginRatio', `${label}.initialMarginRatio`),
        instrumentAddress: requireAddress(record, 'instrumentAddress', `${label}.instrumentAddress`),
        instrumentCondition: requireString(record, 'instrumentCondition', `${label}.instrumentCondition`),
        maintenanceMarginRatio: requireNumber(record, 'maintenanceMarginRatio', `${label}.maintenanceMarginRatio`),
        market: {
            address: requireAddress(market, 'address', `${label}.market.address`),
            type: requireString(market, 'type', `${label}.market.type`),
        },
        minMarginAmount: requireBigInt(record, 'minMarginAmount', `${label}.minMarginAmount`),
        protocolFeeRatio: requireNumber(record, 'protocolFeeRatio', `${label}.protocolFeeRatio`),
        quote: decodeTokenInfo(record.quote, `${label}.quote`),
        quoteType: requireString(record, 'quoteType', `${label}.quoteType`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
        tip: requireBigInt(record, 'tip', `${label}.tip`),
        tradingFeeRatio: requireNumber(record, 'tradingFeeRatio', `${label}.tradingFeeRatio`),
    };
}

function decodeTradeToken(value: unknown, label: string): TokenInfoFromApi {
    const record = requireRecord(value, label);
    return {
        address: requireAddress(record, 'address'),
        symbol: requireString(record, 'symbol'),
        decimals: requireNumber(record, 'decimals'),
        image: optionalString(record, 'image', label + '.image'),
    };
}

type DecodeRow<T> = (record: UnknownRecord, label: string) => T;

function decodeList<T>(value: unknown, label: string, decode: DecodeRow<T>): T[] {
    return requireArray(value, label).map((item, i) => {
        const path = `${label}[${i}]`;
        return decode(requireRecord(item, path), path);
    });
}
function decodePage<T>(value: unknown, label: string, decode: DecodeRow<T>): { list: T[]; totalCount: number } {
    const page = requireRecord(value, label);
    return {
        list: decodeList(page.list === null ? [] : page.list, label + '.list', decode),
        totalCount: requireNumber(page, 'totalCount', label + '.totalCount'),
    };
}

export function decodeMmAccountTransactionHistory(value: unknown): FetchMmAccountTransactionHistoryResponse {
    return decodePage(value, 'MmAccountTransactionHistory', (record, label) => ({
        id: requireString(record, 'id', `${label}.id`),
        timestamp: requireNumber(record, 'timestamp', `${label}.timestamp`),
        tokenAddress: requireString(record, 'tokenAddress', `${label}.tokenAddress`),
        tokenInfo: decodeTokenInfo(record.tokenInfo, `${label}.tokenInfo`),
        txHash: requireString(record, 'txHash', `${label}.txHash`),
        type: requireNumber(record, 'type', `${label}.type`),
        typeString: requireString(record, 'typeString', `${label}.typeString`),
        value: requireString(record, 'value', `${label}.value`),
        valueUsd: requireString(record, 'valueUsd', `${label}.valueUsd`),
    }));
}

export function decodeTradeHistory(value: unknown): FetchTradeHistoryResponse {
    return decodePage(value, 'TradeHistory', (record, label) => ({
        balance: requireString(record, 'balance', `${label}.balance`),
        baseToken: decodeTradeToken(record.baseToken, `${label}.baseToken`),
        event: requireString(record, 'event', `${label}.event`),
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        id: requireString(record, 'id', `${label}.id`),
        instrumentAddress: requireString(record, 'instrumentAddress', `${label}.instrumentAddress`),
        price: requireString(record, 'price', `${label}.price`),
        protocolFee: requireString(record, 'protocolFee', `${label}.protocolFee`),
        quoteToken: decodeTradeToken(record.quoteToken, `${label}.quoteToken`),
        side: requireString(record, 'side', `${label}.side`),
        size: requireString(record, 'size', `${label}.size`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
        timestamp: requireNumber(record, 'timestamp', `${label}.timestamp`),
        tradeFee: requireString(record, 'tradeFee', `${label}.tradeFee`),
        txHash: requireString(record, 'txHash', `${label}.txHash`),
        type: requireString(record, 'type', `${label}.type`),
        typeString: requireString(record, 'typeString', `${label}.typeString`),
    }));
}

export function decodeMmFundingHistory(value: unknown): FetchMmFundingHistoryResponse {
    return decodeList(value, 'MmFundingHistory', (record, label) => ({
        long: requireString(record, 'long', `${label}.long`),
        short: requireString(record, 'short', `${label}.short`),
        timestamp: requireNumber(record, 'timestamp', `${label}.timestamp`),
    }));
}

function unsignedInteger(record: UnknownRecord, key: string, label: string, max = Number.MAX_SAFE_INTEGER): number {
    const value = requireNumber(record, key, `${label}.${key}`);
    if (!Number.isSafeInteger(value) || value < 0 || value > max)
        throw new Error(`Invalid ${label}.${key}: expected unsigned integer up to ${max}`);
    return value;
}

export function decodeMarketKline(value: unknown): FetchFuturesPairKlineChartResponse {
    return decodeList(value, 'market kline', (record, label) => {
        const openTimestamp = unsignedInteger(record, 'openTimestamp', label);
        return {
            ...record,
            openTimestamp,
            timestamp: openTimestamp,
            closeTimestamp: unsignedInteger(record, 'closeTimestamp', label),
            open: requireNumber(record, 'open', label + '.open'),
            high: requireNumber(record, 'high', label + '.high'),
            low: requireNumber(record, 'low', label + '.low'),
            close: requireNumber(record, 'close', label + '.close'),
            baseVolume: requireNumber(record, 'baseVolume', label + '.baseVolume'),
            quoteVolume: requireNumber(record, 'quoteVolume', label + '.quoteVolume'),
            symbol: requireString(record, 'symbol', label + '.symbol'),
        };
    });
}

export function decodeMmKline(value: unknown): FetchMmKlineResponse {
    return decodeList(value, 'MmKline', (record, label) => ({
        baseVolume: requireNumber(record, 'baseVolume', `${label}.baseVolume`),
        close: requireNumber(record, 'close', `${label}.close`),
        closeTime: requireNumber(record, 'closeTime', `${label}.closeTime`),
        high: requireNumber(record, 'high', `${label}.high`),
        low: requireNumber(record, 'low', `${label}.low`),
        open: requireNumber(record, 'open', `${label}.open`),
        openTime: requireNumber(record, 'openTime', `${label}.openTime`),
        quoteVolume: requireNumber(record, 'quoteVolume', `${label}.quoteVolume`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
    }));
}

export function decodeMmLiquidityHistory(value: unknown): FetchMmLiquidityHistoryResponse {
    return decodePage(value, 'MmLiquidityHistory', (record, label) => ({
        amount: requireString(record, 'amount', `${label}.amount`),
        baseToken: decodeTokenInfo(record.baseToken, `${label}.baseToken`),
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        fairPrice: requireString(record, 'fairPrice', `${label}.fairPrice`),
        feeEarned: requireString(record, 'feeEarned', `${label}.feeEarned`),
        id: requireString(record, 'id', `${label}.id`),
        instrumentAddress: requireString(record, 'instrumentAddress', `${label}.instrumentAddress`),
        lowerPrice: requireString(record, 'lowerPrice', `${label}.lowerPrice`),
        lowerTick: requireNumber(record, 'lowerTick', `${label}.lowerTick`),
        quoteToken: decodeTokenInfo(record.quoteToken, `${label}.quoteToken`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
        timestamp: requireNumber(record, 'timestamp', `${label}.timestamp`),
        txHash: requireString(record, 'txHash', `${label}.txHash`),
        type: requireNumber(record, 'type', `${label}.type`),
        typeString: requireString(record, 'typeString', `${label}.typeString`),
        upperPrice: requireString(record, 'upperPrice', `${label}.upperPrice`),
        upperTick: requireNumber(record, 'upperTick', `${label}.upperTick`),
    }));
}

export function decodeMmLiquidityList(value: unknown): FetchMmLiquidityListResponse {
    return decodeList(value, 'MmLiquidityList', (record, label) => ({
        balance: requireString(record, 'balance', `${label}.balance`),
        entryFeeIndex: requireString(record, 'entryFeeIndex', `${label}.entryFeeIndex`),
        entryPrice: requireString(record, 'entryPrice', `${label}.entryPrice`),
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        instrumentAddr: requireString(record, 'instrumentAddr', `${label}.instrumentAddr`),
        lastUpdateTime: requireNumber(record, 'lastUpdateTime', `${label}.lastUpdateTime`),
        lastUpdateTxHash: requireString(record, 'lastUpdateTxHash', `${label}.lastUpdateTxHash`),
        liquidity: requireString(record, 'liquidity', `${label}.liquidity`),
        lowerPrice: requireString(record, 'lowerPrice', `${label}.lowerPrice`),
        rid: requireNumber(record, 'rid', `${label}.rid`),
        sqrtEntryPX96: requireString(record, 'sqrtEntryPX96', `${label}.sqrtEntryPX96`),
        symbol: optionalString(record, 'symbol', `${label}.symbol`),
        tickLower: requireNumber(record, 'tickLower', `${label}.tickLower`),
        tickUpper: requireNumber(record, 'tickUpper', `${label}.tickUpper`),
        traderAddr: requireString(record, 'traderAddr', `${label}.traderAddr`),
        upperPrice: requireString(record, 'upperPrice', `${label}.upperPrice`),
    }));
}

export function decodeMmOrderHistory(value: unknown): FetchMmOrderHistoryResponse {
    return decodePage(value, 'MmOrderHistory', (record, label) => ({
        balance: requireString(record, 'balance', `${label}.balance`),
        baseToken: decodeTokenInfo(record.baseToken, `${label}.baseToken`),
        cancelTimestamp: requireNumber(record, 'cancelTimestamp', `${label}.cancelTimestamp`),
        cancelTxHash: requireString(record, 'cancelTxHash', `${label}.cancelTxHash`),
        expiry: requireNumber(record, 'expiry', `${label}.expiry`),
        feeRebate: requireString(record, 'feeRebate', `${label}.feeRebate`),
        fillTimestamp: requireNumber(record, 'fillTimestamp', `${label}.fillTimestamp`),
        fillTxHash: requireString(record, 'fillTxHash', `${label}.fillTxHash`),
        id: requireString(record, 'id', `${label}.id`),
        instrumentAddress: requireString(record, 'instrumentAddress', `${label}.instrumentAddress`),
        orderPrice: requireString(record, 'orderPrice', `${label}.orderPrice`),
        placeTimestamp: requireNumber(record, 'placeTimestamp', `${label}.placeTimestamp`),
        placeTxHash: requireString(record, 'placeTxHash', `${label}.placeTxHash`),
        quoteToken: decodeTokenInfo(record.quoteToken, `${label}.quoteToken`),
        side: requireString(record, 'side', `${label}.side`),
        size: requireString(record, 'size', `${label}.size`),
        symbol: requireString(record, 'symbol', `${label}.symbol`),
        takenBalance: requireString(record, 'takenBalance', `${label}.takenBalance`),
        takenSize: requireString(record, 'takenSize', `${label}.takenSize`),
        tradeValue: requireString(record, 'tradeValue', `${label}.tradeValue`),
        type: requireNumber(record, 'type', `${label}.type`),
        typeString: requireString(record, 'typeString', `${label}.typeString`),
    }));
}

export function decodeMmOrderRealtime(value: unknown): FetchMmOrderRealtimeResponse {
    return decodeList(value, 'MmOrderRealtime', (record, label) => ({
        balance: requireString(record, 'balance', `${label}.balance`),
        lastUpdateTime: requireNumber(record, 'lastUpdateTime', `${label}.lastUpdateTime`),
        lastUpdateTxHash: requireString(record, 'lastUpdateTxHash', `${label}.lastUpdateTxHash`),
        limitPrice: requireString(record, 'limitPrice', `${label}.limitPrice`),
        nonce: requireNumber(record, 'nonce', `${label}.nonce`),
        oid: requireNumber(record, 'oid', `${label}.oid`),
        side: requireNumber(record, 'side', `${label}.side`),
        size: requireString(record, 'size', `${label}.size`),
        taken: requireString(record, 'taken', `${label}.taken`),
        tick: requireNumber(record, 'tick', `${label}.tick`),
    }));
}

export function decodeTokenCoinsWithSymbol(value: unknown): FetchTokenCoinsWithSymbolResponse {
    return decodeList(value, 'TokenCoinsWithSymbol', (record, label) => ({
        currentPrice: optionalNumber(record, 'currentPrice', `${label}.currentPrice`),
        high24h: optionalNumber(record, 'high24h', `${label}.high24h`),
        imageUrl: optionalString(record, 'imageUrl', `${label}.imageUrl`),
        low24h: optionalNumber(record, 'low24h', `${label}.low24h`),
        priceChangePercentage24H: optionalNumber(
            record,
            'priceChangePercentage24H',
            `${label}.priceChangePercentage24H`
        ),
        symbol: optionalString(record, 'symbol', `${label}.symbol`),
        updateTime: optionalNumber(record, 'updateTime', `${label}.updateTime`),
    }));
}
