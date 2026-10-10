export const API_DOMAIN = 'https://mainnet-api.monday.trade';
export const API_DEFAULT_TIMEOUT = 10000;
export const API_DEFAULT_RETRIES = 3;
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
export const DEFAULT_PAGE_SIZE = 50;
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
        MM_ACCOUNT_TRANSACTION_HISTORY: '/v4/public/mm/account/transaction-history',
        MM_TRADE_HISTORY: '/v4/public/mm/execution/list',
        MM_ORDER_BOOK: '/v4/public/mm/orderBook',
        MM_WALLET_BALANCE: '/v4/public/mm/account/wallet-balance',
        MM_POSITION_LIST: '/v4/public/mm/position/list',
        MM_SERVER_TIME: '/v4/public/mm/serverTime',
        MM_TICKERS: '/v4/public/mm/tickers',
        MM_FUNDING_HISTORY: '/v4/public/mm/funding/history',
        MM_INSTRUMENT_INFO: '/v4/public/mm/instruments-info',
        MM_KLINE: '/v4/public/mm/kline',
        MM_LIQUIDITY_LIST: '/v4/public/mm/liquidity/list',
        MM_LIQUIDITY_HISTORY: '/v4/public/mm/liquidity/history',
        MM_ORDER_HISTORY: '/v4/public/mm/order/history',
        MM_ORDER_REALTIME: '/v4/public/mm/order/realtime',
        MM_TOKEN_COINS_WITH_SYMBOL: '/v4/public/mm/token/coinsWithSymbol',
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
        LIQUIDITY: '/v4/public/history/liquidity',
        TRANSFER: '/v4/public/history/transfer',
    },
} as const;
