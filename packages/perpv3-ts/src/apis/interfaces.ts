import { Address } from 'viem';
import { Erc20TokenInfo } from '@derivation-tech/viem-kit';
import {
    Amm,
    BlockInfo,
    Condition,
    MinimalPearl,
    Order,
    PairSnapshot,
    Position,
    QuoteParam,
    Quotation,
    Range,
    Side,
} from '../types';
import { HISTORY_RANGE } from './constants';

// TokenInfo type compatible with API responses (name is optional, address can be string or Address)
export type TokenInfo = Omit<Erc20TokenInfo, 'name' | 'address'> & {
    name?: string;
    address: string | Address;
};
export interface AuthInfo {
    apiKey: string;
    passphrase: string;
    secretKey: string;
}

export interface SignParams {
    uri: string;
    ts: number;
    body?: object;
}

export interface SignResult {
    'X-Api-Nonce': string;
    'X-Api-Sign': string;
    'X-Api-Ts': number;
}

/**
 * ApiSigner is a function that signs the request parameters
 * @param params - The parameters to sign
 * @returns The signed parameters
 */
export interface ApiSigner {
    sign(params: SignParams): SignResult;
}

/**
 * ApiSignerFunc is a function that signs the request parameters
 */
export type ApiSignerFunc = (params: SignParams) => SignResult;

// Types for the fetchFuturesInstrument function
export interface FetchFuturesInstrumentInput {
    chainId: number;
    address: string;
}

// AmmFromApi extends Amm with API-specific fields and overrides status to be number instead of Status enum
export type AmmFromApi = Omit<Amm, 'status'> & {
    status: number; // API returns number, not Status enum
    blockInfo: BlockInfo;
    fairPrice: bigint;
    instrumentAddr: string;
    markPrice: bigint;
};
// SettingFromApi is a subset of Setting with API response structure
export interface SettingFromApi {
    initialMarginRatio: number;
    maintenanceMarginRatio: number;
    quoteParam: Omit<QuoteParam, 'qtype'> & {
        qtype: number; // API returns number, not QuoteType enum
    };
}
export interface MarketFromApi {
    config: {
        dailyInterestRate: number;
        feederSource: [
            {
                aggregator0: string;
                aggregator1: string;
                baseSymbol: string;
                ftype: number;
                heartBeat0: number;
                heartBeat1: number;
                quoteSymbol: string;
            },
        ];
    };
    feeder: {
        aggregator0: string;
        aggregator1: string;
        ftype: number;
        heartBeat0: number;
        heartBeat1: number;
        scaler0: bigint;
        scaler1: bigint;
    } | null;
    info: {
        addr: Address;
        beacon: Address;
        type: string;
    };
}
export interface InstrumentFromApi {
    amms: AmmFromApi[];
    base: TokenInfo;
    blockInfo: BlockInfo;
    condition: Condition;
    disableOrderRebate: boolean;
    displayBase: TokenInfo;
    displayQuote: TokenInfo;
    fundingHour: number;
    instrumentAddr: Address;
    instrumentType: number;
    market: MarketFromApi;
    marketType: string;
    minOrderValue: bigint;
    minRangeValue: bigint;
    minTickDelta: number;
    minTradeValue: bigint;
    placePaused: boolean;
    quote: TokenInfo;
    setting: SettingFromApi;
    spotPrice: bigint;
    symbol: string;
}

export interface PriceDataFromApi {
    instrumentAddr: Address;
    expiry: number;
    markPrice: bigint;
    spotPrice: bigint;
    benchmarkPrice: bigint;
    feeder0: Address;
    feeder1: Address;
    feeder0UpdatedAt: bigint;
    feeder1UpdatedAt: bigint;
    blockInfo: BlockInfo;
}

export interface QuoteStateFromApi {
    address: Address;
    decimals: number;
    symbol: string;
    threshold: bigint;
    reserve: bigint;
    balance: bigint;
    allowance: bigint;
    fundFlow: {
        totalIn: bigint;
        totalOut: bigint;
    };
    pending: {
        timestamp: number;
        native: boolean;
        amount: bigint;
        exemption: bigint;
    };
}

export type Bigintish = string | number | bigint;

export interface OnChainQuerySettingParamFromApi {
    MinMarginAmount: Bigintish;
    TradingFeeRatio: number;
    ProtocolFeeRatio: number;
    Qtype: number;
    Tip: Bigintish;
}

export interface OnChainQuerySettingFromApi {
    Symbol: string;
    Config: Address;
    Gate: Address;
    Market: Address;
    Quote: Address;
    Decimals: number;
    InitialMarginRatio: number;
    MaintenanceMarginRatio: number;
    PlacePaused: boolean;
    FundingHour: number;
    DisableOrderRebate: boolean;
    Param?: OnChainQuerySettingParamFromApi;
}

export interface OnChainQueryAmmFromApi {
    Expiry: number;
    Timestamp: number;
    Status: number;
    Tick: number;
    SqrtPX96: Bigintish;
    Liquidity: Bigintish;
    TotalLiquidity: Bigintish;
    TotalShort: Bigintish;
    OpenInterests: Bigintish;
    TotalLong: Bigintish;
    InvolvedFund: Bigintish;
    FeeIndex: Bigintish;
    ProtocolFee: Bigintish;
    LongSocialLossIndex: Bigintish;
    ShortSocialLossIndex: Bigintish;
    LongFundingIndex: Bigintish;
    ShortFundingIndex: Bigintish;
    InsuranceFund: Bigintish;
    SettlementPrice: Bigintish;
}

export interface OnChainQueryPriceDataFromApi {
    Instrument: Address;
    Expiry: number;
    MarkPrice: Bigintish;
    SpotPrice: Bigintish;
    BenchmarkPrice: Bigintish;
    Feeder0: Address;
    Feeder1: Address;
    Feeder0UpdatedAt: Bigintish;
    Feeder1UpdatedAt: Bigintish;
}

export interface OnChainQueryPositionFromApi {
    Balance: Bigintish;
    Size: Bigintish;
    EntryNotional: Bigintish;
    EntrySocialLossIndex: Bigintish;
    EntryFundingIndex: Bigintish;
}

export interface OnChainQueryOrderFromApi {
    Balance: Bigintish;
    Size: Bigintish;
}

export interface OnChainQueryRangeFromApi {
    Liquidity: Bigintish;
    EntryFeeIndex: Bigintish;
    Balance: Bigintish;
    SqrtEntryPX96: Bigintish;
}

export interface OnChainQueryPortfolioFromApi {
    Oids?: Array<number | string>;
    Rids?: Array<number | string>;
    Position?: OnChainQueryPositionFromApi | null;
    Orders?: OnChainQueryOrderFromApi[] | null;
    Ranges?: OnChainQueryRangeFromApi[] | null;
    OrdersTaken?: Bigintish[] | null;
}

export interface OnChainQueryQuotationFromApi {
    Benchmark: Bigintish;
    SqrtFairPX96: Bigintish;
    Tick: number;
    Mark: Bigintish;
    EntryNotional: Bigintish;
    Fee: Bigintish;
    MinAmount: Bigintish;
    SqrtPostFairPX96: Bigintish;
    PostTick: number;
}

export interface OnChainQueryQuoteStateFromApi {
    Quote: Address;
    Decimals: number;
    Symbol: string;
    Threshold: Bigintish;
    Reserve: Bigintish;
    Balance: Bigintish;
    Allowance: Bigintish;
    FundFlow?: {
        TotalIn: Bigintish;
        TotalOut: Bigintish;
    };
    Pending?: {
        Timestamp: number;
        Native: boolean;
        Amount: Bigintish;
        Exemption: Bigintish;
    };
}

export interface OnChainQuerySpacingFromApi {
    Pearl: number;
    Order: number;
    Range: number;
}

export interface OnChainQueryBlockInfoFromApi {
    Timestamp: number;
    Height: number;
}

export interface OnChainContextQueryResponseFromApi {
    Setting: OnChainQuerySettingFromApi;
    Condition: number;
    Amm: OnChainQueryAmmFromApi;
    PriceData: OnChainQueryPriceDataFromApi;
    Portfolio?: OnChainQueryPortfolioFromApi | null;
    Quotation?: OnChainQueryQuotationFromApi | null;
    QuoteState?: OnChainQueryQuoteStateFromApi | null;
    Spacing: OnChainQuerySpacingFromApi;
    BlockInfo: OnChainQueryBlockInfoFromApi;
}

export type FetchFuturesInstrumentResponse = InstrumentFromApi | null;

// Types for the fetchFuturesInstrumentInquire function
export interface FetchFuturesInstrumentInquireInput {
    chainId: number;
    instrument: string;
    expiry: number;
    size: string;
}

export type QuotationFromApi = Quotation & {
    size?: bigint;
};

export type FetchFuturesInstrumentInquireResponse = QuotationFromApi | null;

export interface FetchOnChainContextInput {
    chainId: number;
    instrument: Address;
    expiry: number;
    userAddress?: Address;
    signedSize?: string;
}

export interface FetchOnChainContextResponse {
    instrument: InstrumentFromApi | null;
    inquireRes?: QuotationFromApi | null;
    portfolioRes?: FetchPortfolioListFromApiResponse | null;
    priceData?: PriceDataFromApi | null;
    quoteState?: QuoteStateFromApi | null;
}

export type FetchOnChainContextQueryInput = FetchOnChainContextInput;

export type FetchOnChainContextQueryResponse = PairSnapshot | null;

// Types for the fetchFuturesInstrumentInquireByTick function
export interface FetchFuturesInstrumentInquireByTickInput {
    chainId: number;
    instrument: string;
    expiry: number;
    tick: number;
}

export type FetchFuturesInstrumentInquireByTickResponseData = QuotationFromApi;

export type FetchFuturesInstrumentInquireByTickResponse = FetchFuturesInstrumentInquireByTickResponseData | null;

// Types for the fetchFuturesInstrumentInquireByNotional function
export interface FetchFuturesInstrumentInquireByNotionalInput {
    chainId: number;
    instrument: string;
    expiry: number;
    notional: string;
    long: boolean;
}

export type FetchFuturesInstrumentInquireByNotionalResponseData = QuotationFromApi;
export type FetchFuturesInstrumentInquireByNotionalResponse =
    FetchFuturesInstrumentInquireByNotionalResponseData | null;

// OrderFromApi extends Order with API-specific metadata fields
export type OrderFromApi = Order & {
    limitPrice: bigint;
    nonce: number;
    oid: number;
    side: Side;
    taken: bigint;
    tick: number;
};
// PositionFromApi extends Position with API-specific fields
export type PositionFromApi = Position & {
    entryPrice: bigint;
    side: Side;
};
// RangeFromApi extends Range with API-specific metadata fields
export type RangeFromApi = Range & {
    entryPrice: bigint;
    expiry: number;
    instrumentAddr: Address;
    lowerPrice: bigint;
    rid: number;
    tickLower: number;
    tickUpper: number;
    traderAddr: Address;
    upperPrice: bigint;
};
export interface PortfolioFromApi {
    blockInfo: BlockInfo;
    instrumentAddr: Address;
    traderAddr: Address;
    expiry: number;
    position: PositionFromApi[];
    orders: OrderFromApi[];
    ranges: RangeFromApi[];
}

export interface FetchPortfolioListFromApiInput {
    chainId: number;
    userAddress: string;
    instrumentAddress?: string;
    expiry?: number;
}
export interface FetchPortfolioListFromApiResponse {
    address: Address;
    instruments: InstrumentFromApi[];
    portfolios: PortfolioFromApi[];
}

export interface FetchGateBalanceInput {
    chainId: number;
    userAddress: string;
}
export interface GateBalanceInfoFromApi {
    quote: Address;
    decimals: number;
    balance: bigint;
    pendingBalance: {
        amount: bigint;
        exemption: bigint;
    };
    totalInBalance: bigint;
    totalOutBalance: bigint;
}
export type FetchGateBalanceResponse = GateBalanceInfoFromApi[] | null;

export interface FetchTokenPriceMapInput {
    chainId?: number;
}

export interface TokenPriceFromApi {
    symbol: string;
    imageUrl: string;
    currentPrice: number;
    priceChangePercentage24H: number;
    chainId: number;
    address: Address;
    high24h: number;
    low24h: number;
    decimals: number;
}
export interface FetchTokenPriceMapResponse {
    [address: string]: TokenPriceFromApi;
}
export interface TotalValueRequest {
    chainId: number;
    userAddress: Address;
}
export type TokenInfoFromApi = {
    address: Address;
    symbol: string;
    decimals: number;
    image?: string;
};
export interface TokenVolumeFromApi {
    instrumentAddress: Address;
    expiry: number;
    quoteAddress: Address;
    quoteVolume: string; // normal number string
    volumeUsd: string; // normal number string
    baseToken: TokenInfoFromApi;
    quoteToken: TokenInfoFromApi;
    symbol: string;
}
export interface TotalVolumeFromApi {
    totalVolumeUsd: string; // normal number string
    details: TokenPriceFromApi[];
}
export type TotalValueResponse = TotalVolumeFromApi | undefined;

//orderbook
export interface FetchFuturesPairOrderBookInput {
    chainId: number;
    address: string;
    expiry: number;
}

export interface OrderDataFromApi {
    baseQuantity: bigint;
    baseSum: bigint;
    price: bigint;
    quoteSize: bigint;
    quoteSum: bigint;
    tick: number;
}
export interface IFuturesOrderBook {
    asks: OrderDataFromApi[];
    bids: OrderDataFromApi[];
}
export interface IFuturesOrderBookAllSteps {
    [step: string]: IFuturesOrderBook;
}
export type FetchFuturesPairOrderBookResponse = IFuturesOrderBookAllSteps | null;

export interface FetchMmAccountTransactionHistoryInput {
    chainId: number;
    address: string;
    page?: number;
    size?: number;
}

export interface FetchMmAccountTransactionHistoryItem {
    id: string;
    timestamp: number;
    tokenAddress: string;
    tokenInfo: TokenInfo;
    txHash: string;
    type: number;
    typeString: string;
    value: string;
    valueUsd: string;
}
export interface FetchTradeHistoryResponse {
    list: FetchTradeHistoryItem[];
    totalCount: number;
}

export interface FetchTradeHistoryInput {
    chainId: number;
    address: string;
    symbol?: string;
    startTime?: number;
    endTime?: number;
    page?: number;
    size?: number;
}

export interface FetchTradeHistoryItem {
    balance: string;
    baseToken: TokenInfoFromApi;
    event: string;
    expiry: number;
    id: string;
    instrumentAddress: string;
    price: string;
    protocolFee: string;
    quoteToken: TokenInfoFromApi;
    side: string;
    size: string;
    symbol: string;
    timestamp: number;
    tradeFee: string;
    txHash: string;
    type: string;
    typeString: string
}

export type FetchMmAccountTransactionHistoryResponse = {
    list: FetchMmAccountTransactionHistoryItem[];
    totalCount: number;
};

export interface FetchMmFundingHistoryInput {
    chainId: number;
    symbol: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
}

export interface FetchMmFundingHistoryItem {
    long: string;
    short: string;
    timestamp: number;
}
export type FetchMmFundingHistoryResponse = FetchMmFundingHistoryItem[];


export interface FetchMmInstrumentInfoInput {
    chainId: number;
    symbol?: string;
}

export interface FetchMmInstrumentInfoItem {
    base: {
        symbol: string;
    },
    disableMakerOrderRebate: boolean;
    fundingIntervalHour: number;
    initialMarginRatio: number;
    instrumentAddress: string;
    instrumentCondition: string;
    maintenanceMarginRatio: number;
    market: {
        address: string;
        type: string;
    },
    minMarginAmount: string;
    protocolFeeRatio: number;
    quote: TokenInfo,
    quoteType: string;
    symbol: string;
    tip: string;
    tradingFeeRatio: number;
}

export type FetchMmInstrumentInfoResponse = FetchMmInstrumentInfoItem[];

export interface FetchMmKlineInput {
    chainId: number;
    symbol: string;
    interval?: KlineInterval;
    start?: number;
    end?: number;
    limit?: number;
}

export interface FetchMmKlineItem {
    baseVolume: number;
    close: number;
    closeTime: number;
    high: number;
    low: number;
    open: number;
    openTime: number;
    quoteVolume: number;
    symbol: string;
}
export type FetchMmKlineResponse = FetchMmKlineItem[];


export interface FetchMmLiquidityHistoryInput {
    chainId: number;
    address: string;
    symbol?: string;
    startTime?: number;
    endTime?: number;
    page?: number;
    size?: number;
}

export interface FetchMmLiquidityHistoryItem {
    amount: string;
    baseToken: TokenInfo;
    expiry: number;
    fairPrice: string;
    feeEarned: string;
    id: string;
    instrumentAddress: string;
    lowerPrice: string;
    lowerTick: number;
    quoteToken: TokenInfo;
    symbol: string;
    timestamp: number;
    txHash: string;
    type: number;
    typeString: string;
    upperPrice: string;
    upperTick: number;
}

export type FetchMmLiquidityHistoryResponse = {
    list: FetchMmLiquidityHistoryItem[];
    totalCount: number;
}

export interface FetchMmOrderHistoryInput {
    chainId: number;
    address: string;
    symbol?: string;
    startTime?: number;
    endTime?: number;
    page?: number;
    size?: number;
}

export interface FetchMmOrderHistoryItem {
    balance: string;
    baseToken: TokenInfo;
    cancelTimestamp: number;
    cancelTxHash: string;
    expiry: number;
    feeRebate: string;
    fillTimestamp: number;
    fillTxHash: string;
    id: string;
    instrumentAddress: string;
    orderPrice: string;
    placeTimestamp: number;
    placeTxHash: string;
    quoteToken: TokenInfo;
    side: string;
    size: string;
    symbol: string;
    takenBalance: string;
    takenSize: string;
    tradeValue: string;
    type: number;
    typeString: string;
}

export interface FetchMmOrderHistoryResponse {
    list: FetchMmOrderHistoryItem[];
    totalCount: number;
}

export interface FetchMmOrderRealtimeInput {
    chainId: number;
    address: string;
}

export interface FetchMmOrderRealtimeItem {
    balance: string;
    lastUpdateTime: number;
    lastUpdateTxHash: string;
    limitPrice: string;
    nonce: number;
    oid: number;
    side: number;
    size: string;
    taken: string;
    tick: number;
}
export type FetchMmOrderRealtimeResponse = FetchMmOrderRealtimeItem[];

export interface FetchTokenCoinsWithSymbolItem {
    currentPrice: number;
    high24h: number;
    imageUrl: string;
    low24h: number;
    priceChangePercentage24H: number;
    symbol: string;
    updateTime: number;
}
export type FetchTokenCoinsWithSymbolResponse = FetchTokenCoinsWithSymbolItem[];

export interface FetchMmLiquidityListInput {
    chainId: number;
    address: string;
}

export interface FetchMmLiquidityListItem {
    balance: string;
    entryFeeIndex: string;
    entryPrice: string;
    expiry: number;
    instrumentAddr: string;
    lastUpdateTime: number;
    lastUpdateTxHash: string;
    liquidity: string;
    lowerPrice: string;
    rid: number;
    sqrtEntryPX96: string;
    symbol: string;
    tickLower: number;
    tickUpper: number;
    traderAddr: string;
    upperPrice: string;
}

export type FetchMmLiquidityListResponse = FetchMmLiquidityListItem[];

// mm orderbook
export interface FetchMmOrderBookInput {
    chainId: number;
    symbol: string;
    depth?: number;
}
export type FetchMmOrderBookResponse = IFuturesOrderBookAllSteps | null;

// mm portfolio
export interface FetchMmWalletBalanceInput {
    chainId: number;
    address: string;
}

export interface MmPendingBalance {
    timestamp: number;
    native: boolean;
    amount: bigint;
    exemption: bigint;
}

export interface MmWalletPortfolio {
    quote: Address;
    decimals: number;
    balance: bigint;
    pendingBalance: MmPendingBalance;
    totalInBalance: bigint;
    totalOutBalance: bigint;
    reservedBalance: bigint;
    thresholdBalance: bigint;
    maxWithdrawable: bigint;
    symbol: string;
    imageUrl?: string;
    currentPrice?: number;
}

export interface FetchMmWalletBalanceResponse {
    address: Address;
    portfolios: MmWalletPortfolio[];
    isBlacklisted: boolean;
    pendingDuration: bigint;
}

export interface FetchMmPositionListInput {
    chainId: number;
    address: string;
}

export interface MmPositionFromApi {
    balance: bigint;
    size: bigint;
    entryNotional: bigint;
    entrySocialLossIndex: bigint;
    entryFundingIndex: bigint;
    side: number;
    entryPrice: bigint;
    lastUpdateTime: number;
    lastUpdateTxHash: string;
    instrumentAddr: Address;
    expiry: number;
    symbol: string;
}

export type FetchMmPositionListResponse = MmPositionFromApi[];

export interface FetchMmTickersInput {
    chainId: number;
    symbol?: string;
}

export interface FetchMmTicker {
    closeTime24h: number;
    expiry: number;
    fundingRate: string;
    highPrice24h: number;
    instrumentAddress: Address;
    lastPrice: string;
    lowPrice24h: number;
    markPrice: string;
    openInterest: string;
    openPrice24h: number;
    openTime24h: number;
    priceChange24H: string;
    priceChangePercent24h: string;
    quoteVolume24h: string;
    spotPrice: string;
    symbol: string;
    timestamp: number;
    volume24h: string;
}

export type FetchMmTickersResponse = FetchMmTicker[];

//kline chart
export enum KlineInterval {
    MINUTE = '1m',
    FIVE_MINUTE = '5m',
    FIFTEEN_MINUTE = '15m',
    THIRTY_MINUTE = '30m',
    HOUR = '1h',
    FOUR_HOUR = '4h',
    WEEK = '1w',
    DAY = '1d',
}
export interface FetchFuturesPairKlineChartInput {
    chainId: number;
    instrument: Address;
    expiry: number;
    interval: KlineInterval;
    endTime?: number;
    limit?: number;
}
export interface KlineDataFromApi {
    openTimestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    baseVolume: number;
    quoteVolume: number;
    symbol: string;
    closeTimestamp: number;
}
export type FetchFuturesPairKlineChartResponse = KlineDataFromApi[] | null;
//  depth chart
export interface FetchFuturesPairDepthChartInput {
    chainId: number;
    address: string;
    expiry: number;
    stepRatio?: number;
}
export interface ChartLiquidityDetailsFromApi {
    amm: {
        liquidity: bigint;
        sqrtPX96: bigint;
        tick: number;
    };
    blockInfo: BlockInfo;
    isInverse: boolean;
    length: number;
    pearls: MinimalPearl[];
    size: number;
    stepRatio: number;
    tick2Pearl: Map<number, MinimalPearl>;
    tickDelta: number;
    tids: number[];
}
export interface DepthChartData {
    tick: number;
    price: number;
    base: number;
}
export interface DepthData {
    left: DepthChartData[];
    right: DepthChartData[];
}

export type FetchFuturesPairDepthChartResponse = DepthData | null;

// history

export interface InstrumentHistoryBasicInfo {
    id: string;
    instrumentAddress: string;
    expiry: number;
    timestamp: number;
    txHash: string;
    symbol: string;
    baseToken: TokenInfoFromApi;
    quoteToken: TokenInfoFromApi;
}

export interface TradeHistory extends InstrumentHistoryBasicInfo {
    size: string;
    balance: string;
    price: string;
    tradeFee: string;
    protocolFee: string;
    // type: number; // TOOD: 0/1
    typeString: 'market' | 'fill' | 'range' | 'take_over' | 'liquidation'; // TOOD: 0/1
    side: 'long' | 'short';
    // missing for now
    isRangeLiquidated?: boolean;
}

export interface OrderHistory extends Omit<InstrumentHistoryBasicInfo, 'txHash' | 'timestamp'> {
    placeTimestamp: number;
    placeTxHash: string;
    size: string;
    balance: string;
    takenSize: string;
    takenBalance: string;
    orderPrice: string;
    feeRebate: string;
    // type: number; // TOOD: 0/1
    cancelTimestamp: number;
    tradeValue: string;

    typeString: 'filled' | 'cancelled' | 'partial_filled';
    side: 'long' | 'short';

    //  missing fields
    cancelTxHash: string;
    fillTimestamp: number;
    fillTxHash: string;
}

export interface LiquidityHistory extends InstrumentHistoryBasicInfo {
    amount: string;

    fairPrice: string;
    feeEarned: string;

    lowerPrice: string;
    lowerTick: number;
    // type: number;
    typeString: string; // TODO: 0/1
    upperPrice: string;
    upperTick: number;
}

export interface FundingHistory extends InstrumentHistoryBasicInfo {
    // type: number;
    typeString: 'receive' | 'pay'; // receive/pay
    value: string;
    valueUsd: string;
}
export interface TransferHistory extends InstrumentHistoryBasicInfo {
    typeString: 'scatter' | 'gather';
    value: string;
    valueUsd: string;
}

export interface AccountBalanceHistory {
    id: string;
    timestamp: number;
    tokenAddress: string;
    tokenInfo: TokenInfoFromApi;
    txHash: string;
    // type: number;
    typeString: 'deposit' | 'withdraw'; // deposit/withdraw
    value: string;
    valueUsd: string;
}

export interface HistoryRequestPairInfo {
    /** Trading instrument contract address */
    instrumentAddress?: string | undefined;
    /** Instrument expiry timestamp */
    expiry?: number | undefined;
}
export interface HistoryRequestBase {
    /** Chain ID for the blockchain network */
    chainId: number | undefined;
    /** User wallet address */
    userAddress: string | undefined;
    /** Page number for pagination (optional) */
    page?: number;
    /** Number of items per page (optional, defaults to DEFAULT_HISTORY_PAGE_SIZE) */
    size?: number;
    /** Time range filter for historical data */
    timeRange?: HISTORY_RANGE;
    /** Whether to fetch all data without pagination (optional, defaults to false) */
    download?: boolean;
}

/**
 * Parameters for getVirtualTradeHistory function
 * @interface GetVirtualTradeHistoryParams
 */
export interface GetTradeHistoryParams extends HistoryRequestBase, HistoryRequestPairInfo {}

/**
 * Response type for getVirtualTradeHistory function
 * @interface GetVirtualTradeHistoryResponse
 */
export type GetTradeHistoryResponse = TradeHistory[];

/**
 * Parameters for getOrdersHistory function
 * @interface GetOrdersHistoryParams
 */
export interface GetOrdersHistoryParams extends HistoryRequestBase, HistoryRequestPairInfo {}

/**
 * Response type for getOrdersHistory function
 * @interface GetOrdersHistoryResponse
 */
export type GetOrdersHistoryResponse = (OrderHistory & { logIndex?: number })[];

/**
 * Parameters for getFundingHistory function
 * @interface GetFundingHistoryParams
 */
export interface GetFundingHistoryParams extends HistoryRequestBase, HistoryRequestPairInfo {}

/**
 * Response type for getFundingHistory function
 * @interface GetFundingHistoryResponse
 */
export type GetFundingHistoryResponse = FundingHistory[];

/**
 * Parameters for getTransferHistory function
 * @interface GetTransferHistoryParams
 */
export interface GetTransferHistoryParams extends HistoryRequestBase, HistoryRequestPairInfo {}

export interface GetTransferHistoryItemResponse extends TransferHistory {
    timestamp: number;
    instrumentAddress: string;
    expiry: number;
    isTransferIn: boolean;
    txHash: string;
    logIndex: number;
}

/**
 * Response type for getTransferHistory function
 * @interface GetTransferHistoryResponse
 */
export type GetTransferHistoryResponse = GetTransferHistoryItemResponse[];

/**
 * Parameters for getLiquidityHistory function
 * @interface GetLiquidityHistoryParams
 */
export interface GetLiquidityHistoryParams extends HistoryRequestBase, HistoryRequestPairInfo {}

/**
 * Response type for getLiquidityHistory function
 * @interface GetLiquidityHistoryResponse
 */
export type GetLiquidityHistoryResponse = LiquidityHistory[];

/**
 * Parameters for getAccountBalanceHistory function
 * @interface GetAccountBalanceHistoryParams
 */
export type GetAccountBalanceHistoryParams = HistoryRequestBase;

/**
 * Response type for getAccountBalanceHistory function
 * @interface GetAccountBalanceHistoryResponse
 */
export type GetAccountBalanceHistoryResponse = AccountBalanceHistory[];

/** Market  */
export interface IMarketFunding {
    long: string;
    short: string;
}
export interface IMarketPair {
    instrumentAddr: Address;
    expiry: number;
    symbol: string;
    baseToken: Omit<TokenInfoFromApi, 'decimals'>;
    quoteToken: TokenInfoFromApi;
    fairPrice: string;
    markPrice: string;
    fairPriceChange24h: string;
    baseVolume24h: string;
    openInterests: string;
    tvl: string;
    volume24hUsd: string;
    tvlUsd: string;
    openInterestsUsd: string;
    longOi: string;
    shortOi: string;
    periods1hFunding: IMarketFunding;
    last1hFunding: IMarketFunding;
    fundingRatePerHour: string;
    quoteVolume24h: string;
}
export interface FetchMarketPairInfoInput {
    /** Chain ID where the instrument is deployed */
    chainId: number;
    /** Contract address of the instrument */
    address: string;
    /** Expiry timestamp of the pair */
    expiry: number;
}
/**
 * Response containing detailed market pair information
 * @returns IMarketPair object with pricing, volume, and market metrics or null if not found
 */
export type FetchMarketPairInfoResponse = IMarketPair | null;
export type FetchMarketPairListResponse = IMarketPair[] | undefined;
