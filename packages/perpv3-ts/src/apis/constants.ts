export const API_DOMAIN = 'https://mainnet-api.monday.trade';
export const DEFAULT_PUBLIC_WS_URL = 'wss://mainnet-api.monday.trade/v4/public/ws';

export enum FundingChartInterval {
    HOUR = '1h',
    EIGHT_HOUR = '8h',
}
export enum HISTORY_RANGE {
    ALL = 'ALL',
    D_1 = '1D',
    D_7 = '7D',
    M_1 = '1M',
    M_3 = '3M',
}
export const PORTFOLIO_DEBOUNCE_DELAY = 200;
export const GATE_BALANCE_DEBOUNCE_DELAY = 500;
export const DEFAULT_HISTORY_PAGE_SIZE = 60;
export const MAX_HISTORY_PAGE_SIZE = 1000;
export const DEFAULT_PAGE = 1;
export const DEFAULT_HISTORY_PAGE_SIZE_LOCAL = 30;

// api request paths, v4 endpoints
export const API_URLS = {
    PUBLIC: {
        PORTFOLIO: '/v4/public/portfolio',
    },
    MARKET: {
        PAIR_INFO: '/v4/public/market/marketPairInfo',
        PAIR_LIST: '/v4/public/market/marketList',
        GATE_BALANCE: '/v4/public/market/user/gateValue',
        USER_VOLUME: '/v4/public/market/user/volumes',
        INSTRUMENT: '/v4/public/market/instrument',
        INQUIRE: '/v4/public/market/inquire',
        INQUIRE_BY_TICK: '/v4/public/market/inquireByTick',
        INQUIRE_BY_NOTIONAL: '/v4/public/market/inquireByNotional',
        ONCHAIN_CONTEXT: '/v4/public/market/getOnChainContext',
        ONCHAIN_CONTEXT_QUERY: '/v4/public/market/getOnChainContext/onChainQuery',
        ORDER_BOOK: '/v4/public/market/orderBook',
        KLINE_CHARTS: '/v4/public/market/kline',
        DEPTH_CHARTS: '/v4/public/market/depth',
    },
    MM: {
        MM_ORDER_BOOK: '/v4/public/mm/orderBook',
        MM_WALLET_BALANCE: '/v4/public/mm/account/wallet-balance',
        MM_POSITION_LIST: '/v4/public/mm/position/list',
        MM_SERVER_TIME: '/v4/public/mm/serverTime',
    },
    TOKEN: {
        TOKEN_ALL_PRICE: '/v4/public/token/tokensWithAddress',
    },
    // chart related
    HISTORY: {
        TRADE: '/v4/public/history/trade',
        ORDER: '/v4/public/history/order',
        ACCOUNT: '/v4/public/history/fundFlow',
        FUNDING: '/v4/public/history/funding',
        LQUIDITY: '/v4/public/history/liquidity',
        TRANSFER: '/v4/public/history/transfer',
    },
} as const;
// Keys for bigint conversion in API responses
export const INSTRUMENT_BIGINT_KEYS: string[] = [
    // Direct instrument keys
    'spotPrice',
    'minTradeValue',
    'minOrderValue',
    'minRangeValue',
    // Nested AMM keys
    'sqrtPX96',
    'liquidity',
    'totalLiquidity',
    'involvedFund',
    'openInterests',
    'feeIndex',
    'protocolFee',
    'totalLong',
    'totalShort',
    'longSocialLossIndex',
    'shortSocialLossIndex',
    'longFundingIndex',
    'shortFundingIndex',
    'insuranceFund',
    'settlementPrice',
    'markPrice',
    'fairPrice',
    // Nested setting keys
    'minMarginAmount',
    'stabilityFeeRatioParam',
    'tip',
];

// Keys for bigint conversion in inquire API responses
export const INQUIRE_BIGINT_KEYS: string[] = [
    'benchmark',
    'sqrtFairPX96',
    'mark',
    'entryNotional',
    'fee',
    'minAmount',
    'sqrtPostFairPX96',
];

// Keys for bigint conversion in inquire by tick/notional API responses
export const INQUIRE_BY_TICK_BIGINT_KEYS: string[] = [
    'size',
    // under quotation
    'benchmark',
    'sqrtFairPX96',
    'mark',
    'entryNotional',
    'fee',
    'minAmount',
    'sqrtPostFairPX96',
];

// BigNumber field keys used in portfolio API response processing
export const PORTFOLIO_BIG_INT_KEYS = [
    // Direct instrument keys
    'spotPrice',
    'minTradeValue',
    'minOrderValue',
    'minRangeValue',
    // Nested AMM keys
    'sqrtPX96',
    'liquidity',
    'totalLiquidity',
    'involvedFund',
    'openInterests',
    'feeIndex',
    'protocolFee',
    'totalLong',
    'totalShort',
    'longSocialLossIndex',
    'shortSocialLossIndex',
    'longFundingIndex',
    'shortFundingIndex',
    'insuranceFund',
    'settlementPrice',
    'markPrice',
    'fairPrice',
    // Nested setting keys
    'minMarginAmount',
    'stabilityFeeRatioParam',
    'tip',
    // Portfolio-specific keys
    'balance',
    'size',
    'entryNotional',
    'entrySocialLossIndex',
    'entryFundingIndex',
    'entryPrice',
    // Order-specific keys
    'taken',
    'left',
    'entryFundingIndex',
    'limitPrice',
    // Range-specific keys
    'liquidity',
    'sqrtEntryPX96',
    'entryFeeIndex',
    'lowerPrice',
    'upperPrice',
] as const;

export const GATE_BALANCE_BIGINT_KEYS = ['totalInBalance', 'totalOutBalance', 'balance', 'amount', 'exemption'];
export const ORDER_DATA_BIGINT_KEYS = ['baseQuantity', 'baseSum', 'quoteSize', 'quoteSum', 'price'];
export const DEPTH_CHART_BIGINT_KEYS = ['liquidity', 'sqrtPX96', 'left', 'liquidityNet'];
export const PRICE_DATA_BIGINT_KEYS = [
    'markPrice',
    'spotPrice',
    'benchmarkPrice',
    'feeder0UpdatedAt',
    'feeder1UpdatedAt',
];
export const QUOTE_STATE_BIGINT_KEYS = [
    'threshold',
    'reserve',
    'balance',
    'allowance',
    'totalIn',
    'totalOut',
    'amount',
    'exemption',
];

// MM wallet/position bigint keys
export const MM_WALLET_PORTFOLIO_BIGINT_KEYS = [
    'balance',
    'totalInBalance',
    'totalOutBalance',
    'reservedBalance',
    'thresholdBalance',
    'maxWithdrawable',
    'pendingDuration',
    'amount',
    'exemption',
] as const;

export const MM_POSITION_BIGINT_KEYS = [
    'balance',
    'size',
    'entryNotional',
    'entrySocialLossIndex',
    'entryFundingIndex',
    'entryPrice',
] as const;
