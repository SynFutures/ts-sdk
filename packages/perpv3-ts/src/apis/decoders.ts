import type {
    AmmFromApi,
    ChartLiquidityDetailsFromApi,
    FetchFuturesInstrumentResponse,
    FetchGateBalanceResponse,
    FetchMmInstrumentInfoItem,
    FetchMmInstrumentInfoResponse,
    FetchMmPositionListResponse,
    FetchMmWalletBalanceResponse,
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
    return {
        benchmark: requireBigInt(record, 'benchmark'),
        sqrtFairPX96: requireBigInt(record, 'sqrtFairPX96'),
        tick: requireNumber(record, 'tick'),
        mark: requireBigInt(record, 'mark'),
        entryNotional: requireBigInt(record, 'entryNotional'),
        fee: requireBigInt(record, 'fee'),
        size: requireBigInt(record, 'size'),
        minAmount: requireBigInt(record, 'minAmount'),
        sqrtPostFairPX96: requireBigInt(record, 'sqrtPostFairPX96'),
        postTick: requireNumber(record, 'postTick'),
    };
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
