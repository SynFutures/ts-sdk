import {
    INSTRUMENT_BIGINT_KEYS,
    INQUIRE_BIGINT_KEYS,
    INQUIRE_BY_TICK_BIGINT_KEYS,
    PORTFOLIO_BIG_INT_KEYS,
    API_URLS,
    GATE_BALANCE_BIGINT_KEYS,
    ORDER_DATA_BIGINT_KEYS,
    DEPTH_CHART_BIGINT_KEYS,
    DEFAULT_HISTORY_PAGE_SIZE,
    DEFAULT_PAGE,
    PRICE_DATA_BIGINT_KEYS,
    QUOTE_STATE_BIGINT_KEYS,
    MM_WALLET_PORTFOLIO_BIGINT_KEYS,
    MM_POSITION_BIGINT_KEYS,
} from './constants';
import { DEFAULT_FUNDING_HOUR } from '../constants';
import { zeroAddress } from 'viem';
import {
    FetchFuturesInstrumentInput,
    FetchFuturesInstrumentResponse,
    FetchFuturesInstrumentInquireInput,
    FetchFuturesInstrumentInquireResponse,
    FetchFuturesInstrumentInquireByTickInput,
    FetchFuturesInstrumentInquireByTickResponse,
    FetchFuturesInstrumentInquireByNotionalInput,
    FetchFuturesInstrumentInquireByNotionalResponse,
    FetchPortfolioListFromApiResponse,
    FetchGateBalanceResponse,
    FetchGateBalanceInput,
    FetchPortfolioListFromApiInput,
    FetchOnChainContextInput,
    FetchOnChainContextResponse,
    FetchTokenPriceMapInput,
    FetchTokenPriceMapResponse,
    TokenPriceFromApi,
    TotalValueRequest,
    TotalValueResponse,
    FetchFuturesPairOrderBookInput,
    OrderDataFromApi,
    IFuturesOrderBookAllSteps,
    FetchFuturesPairOrderBookResponse,
    FetchFuturesPairKlineChartInput,
    FetchFuturesPairDepthChartInput,
    FetchFuturesPairDepthChartResponse,
    AuthInfo,
    KlineDataFromApi,
    FetchFuturesPairKlineChartResponse,
    GetTradeHistoryParams,
    GetAccountBalanceHistoryParams,
    GetAccountBalanceHistoryResponse,
    GetFundingHistoryParams,
    GetFundingHistoryResponse,
    GetLiquidityHistoryParams,
    GetLiquidityHistoryResponse,
    GetOrdersHistoryParams,
    GetOrdersHistoryResponse,
    GetTradeHistoryResponse,
    GetTransferHistoryParams,
    GetTransferHistoryResponse,
    TransferHistory,
    FetchMarketPairInfoInput,
    FetchMarketPairInfoResponse,
    FetchMarketPairListResponse,
    IMarketPair,
    FetchOnChainContextQueryInput,
    FetchOnChainContextQueryResponse,
    OnChainContextQueryResponseFromApi,
    OnChainQuerySettingFromApi,
    OnChainQueryAmmFromApi,
    OnChainQueryPriceDataFromApi,
    OnChainQueryPortfolioFromApi,
    OnChainQueryPositionFromApi,
    OnChainQueryOrderFromApi,
    OnChainQueryRangeFromApi,
    OnChainQueryQuotationFromApi,
    OnChainQueryQuoteStateFromApi,
    OnChainQuerySpacingFromApi,
    OnChainQueryBlockInfoFromApi,
    Bigintish,
    FetchMmOrderBookInput,
    FetchMmOrderBookResponse,
    FetchMmWalletBalanceInput,
    FetchMmWalletBalanceResponse,
    FetchMmPositionListInput,
    FetchMmPositionListResponse,
    MmWalletPortfolio,
    MmPositionFromApi,
} from './interfaces';
import {
    Condition,
    MinimalPearl,
    PairSnapshot,
    Setting,
    QuoteParam,
    Amm,
    PriceData,
    Portfolio,
    QuoteState,
    SpacingConfig,
    BlockInfo,
    Quotation,
    Order,
    Position,
    Range,
} from '../types';
import { axiosGet, bigInitObjectCheckByKeys } from '../utils';
import { getDepthRangeDataByLiquidityDetails } from '../frontend/chart';
import { getStartEndTimeByRangeType } from '../frontend/history';

export const fetchMmServerTime = async (authInfo: AuthInfo): Promise<number> => {
    const res = await axiosGet({
        url: API_URLS.MM.MM_SERVER_TIME,
        config: {},
        authInfo,
    });
    return res.data.data;
};

// Main function: fetchFuturesInstrument
export const fetchFuturesInstrument = async (
    { chainId, address }: FetchFuturesInstrumentInput,
    authInfo: AuthInfo
): Promise<FetchFuturesInstrumentResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.INSTRUMENT,
        config: { params: { chainId, address } },
        authInfo,
    });

    if (res?.data?.data) {
        return bigInitObjectCheckByKeys(res.data.data, INSTRUMENT_BIGINT_KEYS);
    }
    return null;
};

export const fetchMarketOnChainContext = async (
    { chainId, instrument, expiry, userAddress, signedSize }: FetchOnChainContextInput,
    authInfo: AuthInfo
): Promise<FetchOnChainContextResponse | null> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.ONCHAIN_CONTEXT,
        config: {
            params: {
                chainId,
                instrument,
                expiry,
                ...(userAddress ? { userAddress } : {}),
                ...(signedSize !== undefined ? { signedSize } : {}),
            },
        },
        authInfo,
    });

    if (!res?.data?.data) {
        return null;
    }

    const { instrument: instrumentData, inquireRes, portfolioRes, priceData, quoteState } = res.data.data;

    const normalizedInstrument = instrumentData
        ? bigInitObjectCheckByKeys(instrumentData, INSTRUMENT_BIGINT_KEYS)
        : null;

    const normalizedQuotation = inquireRes
        ? (() => {
            const inquireData = bigInitObjectCheckByKeys(inquireRes, INQUIRE_BIGINT_KEYS);
            return {
                ...inquireData,
                tick: Number(inquireData.tick),
                postTick: Number(inquireData.postTick),
            };
        })()
        : null;

    const normalizedPortfolio = portfolioRes
        ? bigInitObjectCheckByKeys(portfolioRes, [...PORTFOLIO_BIG_INT_KEYS])
        : null;

    const normalizedPriceData = priceData ? bigInitObjectCheckByKeys(priceData, PRICE_DATA_BIGINT_KEYS) : null;

    const normalizedQuoteState = quoteState ? bigInitObjectCheckByKeys(quoteState, QUOTE_STATE_BIGINT_KEYS) : null;

    return {
        instrument: normalizedInstrument,
        inquireRes: normalizedQuotation,
        portfolioRes: normalizedPortfolio,
        priceData: normalizedPriceData,
        quoteState: normalizedQuoteState,
    };
};

export const fetchMarketOnChainContextQuery = async (
    { chainId, instrument, expiry, userAddress, signedSize }: FetchOnChainContextQueryInput,
    authInfo: AuthInfo
): Promise<FetchOnChainContextQueryResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.ONCHAIN_CONTEXT_QUERY,
        config: {
            params: {
                chainId,
                instrument,
                expiry,
                ...(userAddress ? { userAddress } : {}),
                ...(signedSize !== undefined ? { signedSize } : {}),
            },
        },
        authInfo,
    });

    if (!res?.data?.data) {
        return null;
    }

    const rawData: OnChainContextQueryResponseFromApi = res.data.data;

    if (!rawData?.Setting || !rawData?.Amm || !rawData?.PriceData || !rawData?.Spacing || !rawData?.BlockInfo) {
        return null;
    }

    return buildOnChainContextFromQuery(rawData);
};

// Function: fetchFuturesInstrumentInquire
export const fetchFuturesInstrumentInquire = async (
    { chainId, instrument, expiry, size }: FetchFuturesInstrumentInquireInput,
    authInfo: AuthInfo
): Promise<FetchFuturesInstrumentInquireResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.INQUIRE,
        config: { params: { chainId, instrument, expiry, size } },
        authInfo,
    });
    if (res?.data?.data) {
        const data = bigInitObjectCheckByKeys(res.data.data, INQUIRE_BIGINT_KEYS);

        return {
            ...data,
            tick: Number(data.tick),
            postTick: Number(data.postTick),
        };
    }
    return null;
};

export const fetchFuturesInstrumentInquireByTick = async (
    { chainId, instrument, expiry, tick }: FetchFuturesInstrumentInquireByTickInput,
    authInfo: AuthInfo
): Promise<FetchFuturesInstrumentInquireByTickResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.INQUIRE_BY_TICK,
        config: { params: { chainId, instrument, expiry, tick } },
        authInfo,
    });
    if (res?.data?.data) {
        const data = bigInitObjectCheckByKeys(res.data.data, INQUIRE_BY_TICK_BIGINT_KEYS);

        // Return the data in the expected structure
        return {
            benchmark: data.benchmark,
            sqrtFairPX96: data.sqrtFairPX96,
            tick: Number(data.tick),
            mark: data.mark,
            entryNotional: data.entryNotional,
            fee: data.fee,
            size: BigInt(data.size || 0),
            minAmount: data.minAmount,
            sqrtPostFairPX96: data.sqrtPostFairPX96,
            postTick: Number(data.postTick),
        };
    }
    return null;
};

export const fetchFuturesInstrumentInquireByNotional = async (
    { chainId, instrument, expiry, notional, long }: FetchFuturesInstrumentInquireByNotionalInput,
    authInfo: AuthInfo
): Promise<FetchFuturesInstrumentInquireByNotionalResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.INQUIRE_BY_NOTIONAL,
        config: { params: { chainId, instrument, expiry, notional, long } },
        authInfo,
    });
    if (res?.data?.data) {
        const data = bigInitObjectCheckByKeys(res.data.data, INQUIRE_BY_TICK_BIGINT_KEYS);

        // Return the data in the expected structure
        return {
            benchmark: data.benchmark,
            sqrtFairPX96: data.sqrtFairPX96,
            tick: Number(data.tick),
            mark: data.mark,
            entryNotional: data.entryNotional,
            fee: data.fee,
            size: BigInt(data.size || 0),
            minAmount: data.minAmount,
            sqrtPostFairPX96: data.sqrtPostFairPX96,
            postTick: Number(data.postTick),
        };
    }
    return null;
};
export const fetchPortfolioListFromApi = async (
    { chainId, userAddress, instrumentAddress, expiry }: FetchPortfolioListFromApiInput,
    authInfo?: AuthInfo
): Promise<FetchPortfolioListFromApiResponse | null> => {
    const res = await axiosGet({
        url: API_URLS.PUBLIC.PORTFOLIO,
        config: {
            params: {
                chainId,
                userAddress: userAddress,
                ...(instrumentAddress && { instrumentAddress }),
                ...(expiry && { expiry }),
            },
        },
        authInfo,
    });
    if (res?.data?.data) {
        const data = bigInitObjectCheckByKeys(res.data.data, [...PORTFOLIO_BIG_INT_KEYS]);
        return data;
    }
    return null;
};

export const fetchFuturesPairOrderBook = async (
    { chainId, address, expiry }: FetchFuturesPairOrderBookInput,
    authInfo: AuthInfo
): Promise<FetchFuturesPairOrderBookResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.ORDER_BOOK,
        config: { params: { chainId, address, expiry } },
        authInfo,
    });

    if (res?.data?.data) {
        const newData = Object.entries(res.data.data).reduce((acc, [key, depth]: [string, any]) => {
            // Transform bids and asks to left and right arrays
            const bids: OrderDataFromApi[] = (depth.bids || [])
                // TODO: Normalize legacy `baseSize` responses to `baseQuantity` once API payloads are updated.
                .map((b: OrderDataFromApi) => bigInitObjectCheckByKeys(b, ORDER_DATA_BIGINT_KEYS))
                .sort((a: OrderDataFromApi, b: OrderDataFromApi) => b.tick - a.tick);

            const asks: OrderDataFromApi[] = (depth.asks || [])
                // TODO: Normalize legacy `baseSize` responses to `baseQuantity` once API payloads are updated.
                .map((a: OrderDataFromApi) => bigInitObjectCheckByKeys(a, ORDER_DATA_BIGINT_KEYS))
                .sort((a: OrderDataFromApi, b: OrderDataFromApi) => a.tick - b.tick);

            acc[key] = { asks, bids };
            return acc;
        }, {} as IFuturesOrderBookAllSteps);

        return newData;
    }
    return null;
};

export const fetchMmOrderBook = async (
    { chainId, symbol, depth }: FetchMmOrderBookInput,
    authInfo?: AuthInfo
): Promise<FetchMmOrderBookResponse> => {
    const res = await axiosGet({
        url: API_URLS.MM.MM_ORDER_BOOK,
        config: { params: { chainId, symbol, ...(depth ? { depth } : {}) } },
        authInfo,
    });

    if (res?.data?.data) {
        const newData = Object.entries(res.data.data).reduce((acc, [key, depthData]: [string, any]) => {
            const bids: OrderDataFromApi[] = (depthData.bids || [])
                // TODO: Normalize legacy `baseSize` responses to `baseQuantity` once API payloads are updated.
                .map((b: OrderDataFromApi) => bigInitObjectCheckByKeys(b, ORDER_DATA_BIGINT_KEYS))
                .sort((a: OrderDataFromApi, b: OrderDataFromApi) => b.tick - a.tick);

            const asks: OrderDataFromApi[] = (depthData.asks || [])
                // TODO: Normalize legacy `baseSize` responses to `baseQuantity` once API payloads are updated.
                .map((a: OrderDataFromApi) => bigInitObjectCheckByKeys(a, ORDER_DATA_BIGINT_KEYS))
                .sort((a: OrderDataFromApi, b: OrderDataFromApi) => a.tick - b.tick);

            acc[key] = { asks, bids };
            return acc;
        }, {} as IFuturesOrderBookAllSteps);

        return newData;
    }
    return null;
};

export const fetchMmWalletBalance = async (
    { chainId, address }: FetchMmWalletBalanceInput,
    authInfo: AuthInfo
): Promise<FetchMmWalletBalanceResponse | null> => {
    const res = await axiosGet({
        url: API_URLS.MM.MM_WALLET_BALANCE,
        config: { params: { chainId, address } },
        authInfo,
    });

    const data = res?.data?.data;
    if (!data) {
        return null;
    }

    const portfolios: MmWalletPortfolio[] = (data.portfolios ?? []).map((p: MmWalletPortfolio) =>
        bigInitObjectCheckByKeys(p, MM_WALLET_PORTFOLIO_BIGINT_KEYS as unknown as string[])
    );

    return {
        ...data,
        portfolios,
        pendingDuration: BigInt(data.pendingDuration ?? 0),
    };
};

export const fetchMmPositionList = async (
    { chainId, address }: FetchMmPositionListInput,
    authInfo: AuthInfo
): Promise<FetchMmPositionListResponse | null> => {
    const res = await axiosGet({
        url: API_URLS.MM.MM_POSITION_LIST,
        config: { params: { chainId, address } },
        authInfo,
    });

    const data = res?.data?.data;
    if (!data) {
        return null;
    }

    return (data as MmPositionFromApi[]).map((p) =>
        bigInitObjectCheckByKeys(p, MM_POSITION_BIGINT_KEYS as unknown as string[])
    );
};

export const fetchUserGateBalanceFromApi = async (
    { chainId, userAddress }: FetchGateBalanceInput,
    authInfo: AuthInfo
): Promise<FetchGateBalanceResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.GATE_BALANCE,
        config: { params: { chainId, userAddress: userAddress } },
        authInfo,
    });
    if (res?.data?.data.portfolios) {
        const data = bigInitObjectCheckByKeys(res.data.data.portfolios, GATE_BALANCE_BIGINT_KEYS);
        return data;
    }
    return null;
};

export const fetchUserTotalValue = async (
    param: TotalValueRequest,
    authInfo: AuthInfo
): Promise<TotalValueResponse> => {
    const result = await axiosGet({
        url: API_URLS.MARKET.USER_VOLUME,
        config: {
            params: param,
        },
        authInfo,
    });
    return result?.data?.data;
};

export const fetchTokenPriceMapFromApi = async (
    { chainId }: FetchTokenPriceMapInput,
    authInfo: AuthInfo
): Promise<FetchTokenPriceMapResponse> => {
    const response = await axiosGet({
        url: API_URLS.TOKEN.TOKEN_ALL_PRICE,
        config: { params: { chainId } },
        authInfo,
    });
    const tokenPriceMap = Object.fromEntries(
        ((response?.data?.data as TokenPriceFromApi[]) || []).map((item) => [item.address, item])
    );

    return tokenPriceMap;
};

export const fetchFuturesPairKlineChart = async (
    { chainId, instrument, expiry, interval, endTime, limit = 1000 }: FetchFuturesPairKlineChartInput,
    authInfo: AuthInfo
): Promise<FetchFuturesPairKlineChartResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.KLINE_CHARTS,
        config: {
            params: {
                chainId,
                instrument,
                expiry,
                interval,
                ...(endTime && { endTime }),
                limit,
            },
        },
        authInfo,
    });
    const rawData = res?.data?.data as KlineDataFromApi[];
    return rawData.map((d) => ({
        ...d,
        timestamp: d.openTimestamp,
    }));
};

export const fetchFuturesPairDepthChart = async (
    param: FetchFuturesPairDepthChartInput,
    authInfo: AuthInfo
): Promise<FetchFuturesPairDepthChartResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.DEPTH_CHARTS,
        config: { params: param },
        authInfo,
    });
    if (res?.data?.data) {
        const data = bigInitObjectCheckByKeys(res.data.data, DEPTH_CHART_BIGINT_KEYS);
        const tick2PearlRaw = (data as { tick2Pearl?: unknown }).tick2Pearl;
        const tick2PearlEntries =
            tick2PearlRaw && typeof tick2PearlRaw === 'object'
                ? Object.entries(tick2PearlRaw as Record<string, unknown>)
                : [];

        data.tick2Pearl = tick2PearlEntries.reduce((acc, [key, value]) => {
            const pearlTuple = normalizeMinimalPearlTuple(value);
            if (!pearlTuple) {
                return acc;
            }
            const [liquidityNet, left] = pearlTuple;
            acc.set(Number(key), { liquidityNet, left });
            return acc;
        }, new Map<number, MinimalPearl>());

        const newData = getDepthRangeDataByLiquidityDetails(data, data.size, data.stepRatio);
        return newData;
    }
    return null;
};

// history

type MinimalPearlTuple = readonly [bigint, bigint];

function normalizeMinimalPearlTuple(value: unknown): MinimalPearlTuple | null {
    if (Array.isArray(value)) {
        if (value.length < 2) {
            return null;
        }
        const [liquidityNet, left] = value;
        return [toBigIntOrZero(liquidityNet), toBigIntOrZero(left)] as const;
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if ('liquidityNet' in record && 'left' in record) {
            return [toBigIntOrZero(record.liquidityNet), toBigIntOrZero(record.left)] as const;
        }
        if ('0' in record && '1' in record) {
            return [toBigIntOrZero(record[0]), toBigIntOrZero(record[1])] as const;
        }
    }

    return null;
}

function toBigIntOrZero(value: unknown): bigint {
    if (typeof value === 'bigint') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return 0n;
        }
        return BigInt(Math.trunc(value));
    }
    if (typeof value === 'string') {
        const normalized = value.trim();
        if (!normalized) {
            return 0n;
        }
        try {
            return BigInt(normalized);
        } catch {
            return 0n;
        }
    }
    return 0n;
}

export const fetchTradeHistory = async (
    params: GetTradeHistoryParams,
    authInfo: AuthInfo
): Promise<GetTradeHistoryResponse> => {
    const {
        chainId,
        userAddress,
        instrumentAddress,
        expiry,
        page = 1,
        size: pageSize = DEFAULT_HISTORY_PAGE_SIZE,
        timeRange,
        download = false,
    } = params;

    if (!userAddress) {
        return [];
    }
    const { startTime, endTime } = getStartEndTimeByRangeType(timeRange);
    const result = await axiosGet({
        url: API_URLS.HISTORY.TRADE,
        config: {
            params: {
                chainId,
                userAddress,
                ...(download
                    ? { download: true }
                    : {
                        ...(pageSize !== undefined && { size: pageSize }),
                        ...(instrumentAddress !== undefined && { instrumentAddress }),
                        ...(expiry !== undefined && { expiry }),
                        ...(startTime !== undefined && { startTime }),
                        ...(endTime !== undefined && { endTime }),
                        ...(page !== undefined && { page }),
                    }),
            },
        },
        authInfo,
    });
    const tradeHistoryList = result?.data?.data?.list;
    if (!Array.isArray(tradeHistoryList)) {
        return [];
    }
    type TradeHistoryItem = GetTradeHistoryResponse[number];
    return [...(tradeHistoryList as TradeHistoryItem[])].sort(
        (a: TradeHistoryItem, b: TradeHistoryItem) => b.timestamp - a.timestamp
    );
};

export const fetchOrdersHistory = async (
    params: GetOrdersHistoryParams,
    authInfo: AuthInfo
): Promise<GetOrdersHistoryResponse> => {
    const {
        chainId,
        userAddress,
        instrumentAddress,
        expiry,
        timeRange,
        page = DEFAULT_PAGE,
        size: pageSize = DEFAULT_HISTORY_PAGE_SIZE,
        download = false,
    } = params;

    if (!userAddress) {
        return [];
    }
    const { startTime, endTime } = getStartEndTimeByRangeType(timeRange);
    const result = await axiosGet({
        url: API_URLS.HISTORY.ORDER,
        config: {
            params: {
                chainId,
                userAddress,
                ...(download
                    ? { download: true }
                    : {
                        ...(pageSize !== undefined && { size: pageSize }),
                        ...(instrumentAddress !== undefined && { instrumentAddress }),
                        ...(expiry !== undefined && { expiry }),
                        ...(startTime !== undefined && { startTime }),
                        ...(endTime !== undefined && { endTime }),
                        ...(page !== undefined && { page }),
                    }),
            },
        },
        authInfo,
    });
    const orderHistoryList = result?.data?.data?.list;
    if (!Array.isArray(orderHistoryList)) {
        return [];
    }
    type OrderHistoryItem = GetOrdersHistoryResponse[number] & { timestamp?: number };
    const getOrderHistoryTimestamp = (value: OrderHistoryItem): number => value.timestamp ?? value.placeTimestamp ?? 0;

    return [...(orderHistoryList as OrderHistoryItem[])].sort(
        (a: OrderHistoryItem, b: OrderHistoryItem) => getOrderHistoryTimestamp(b) - getOrderHistoryTimestamp(a)
    );
};

export const fetchFundingHistory = async (
    params: GetFundingHistoryParams,
    authInfo: AuthInfo
): Promise<GetFundingHistoryResponse> => {
    const {
        chainId,
        userAddress,
        instrumentAddress,
        expiry,
        timeRange,
        page = DEFAULT_PAGE,
        size: pageSize = DEFAULT_HISTORY_PAGE_SIZE,
        download = false,
    } = params;

    if (!userAddress) return [];

    const { startTime, endTime } = getStartEndTimeByRangeType(timeRange);
    const result = await axiosGet({
        url: API_URLS.HISTORY.FUNDING,
        config: {
            params: {
                chainId,
                userAddress,
                ...(download
                    ? { download: true }
                    : {
                        ...(pageSize !== undefined && { size: pageSize }),
                        ...(instrumentAddress !== undefined && { instrumentAddress }),
                        ...(expiry !== undefined && { expiry }),
                        ...(startTime !== undefined && { startTime }),
                        ...(endTime !== undefined && { endTime }),
                        ...(page !== undefined && { page }),
                    }),
            },
        },
        authInfo,
    });

    const historyList = result.data.data.list || [];
    return historyList;
};

export const fetchTransferHistory = async (
    params: GetTransferHistoryParams,
    authInfo: AuthInfo
): Promise<GetTransferHistoryResponse> => {
    const {
        chainId,
        userAddress,
        instrumentAddress,
        expiry,
        timeRange,
        page = DEFAULT_PAGE,
        size: pageSize = DEFAULT_HISTORY_PAGE_SIZE,
        download = false,
    } = params;

    if (!userAddress) return [];

    const { startTime, endTime } = getStartEndTimeByRangeType(timeRange);
    const result = await axiosGet({
        url: API_URLS.HISTORY.TRANSFER,
        config: {
            params: {
                chainId,
                userAddress,
                ...(download
                    ? { download: true }
                    : {
                        ...(pageSize !== undefined && { size: pageSize }),
                        ...(instrumentAddress !== undefined && { instrumentAddress }),
                        ...(expiry !== undefined && { expiry }),
                        ...(startTime !== undefined && { startTime }),
                        ...(endTime !== undefined && { endTime }),
                        ...(page !== undefined && { page }),
                    }),
            },
        },
        authInfo,
    });

    const historyList = result.data.data.list || [];

    return (
        historyList?.map((history: TransferHistory) => ({
            ...history,
        })) || []
    );
};

export const fetchLiquidityHistory = async (
    params: GetLiquidityHistoryParams,
    authInfo: AuthInfo
): Promise<GetLiquidityHistoryResponse> => {
    const {
        chainId,
        userAddress,
        instrumentAddress,
        expiry,
        timeRange,
        page = DEFAULT_PAGE,
        size: pageSize = DEFAULT_HISTORY_PAGE_SIZE,
        download = false,
    } = params;

    if (!userAddress) return [];

    const { startTime, endTime } = getStartEndTimeByRangeType(timeRange);
    const result = await axiosGet({
        url: API_URLS.HISTORY.LQUIDITY,
        config: {
            params: {
                chainId,
                userAddress,
                ...(download
                    ? { download: true }
                    : {
                        ...(pageSize !== undefined && { size: pageSize }),
                        ...(instrumentAddress !== undefined && { instrumentAddress }),
                        ...(expiry !== undefined && { expiry }),
                        ...(startTime !== undefined && { startTime }),
                        ...(endTime !== undefined && { endTime }),
                        ...(page !== undefined && { page }),
                    }),
            },
        },
        authInfo,
    });

    const eventList = result.data.data.list || [];
    return eventList;
};

export const fetchAccountBalanceHistory = async (
    params: GetAccountBalanceHistoryParams,
    authInfo: AuthInfo
): Promise<GetAccountBalanceHistoryResponse> => {
    const {
        chainId,
        userAddress,
        timeRange,
        page = DEFAULT_PAGE,
        size: pageSize = DEFAULT_HISTORY_PAGE_SIZE,
        download = false,
    } = params;

    if (!userAddress) return [];

    const { startTime, endTime } = getStartEndTimeByRangeType(timeRange);
    const result = await axiosGet({
        url: API_URLS.HISTORY.ACCOUNT,
        config: {
            params: {
                chainId,
                userAddress,

                ...(download
                    ? { download: true }
                    : {
                        ...(startTime !== undefined && { startTime }),
                        ...(endTime !== undefined && { endTime }),
                        ...(page !== undefined && { page }),
                        ...(pageSize !== undefined && { size: pageSize }),
                    }),
            },
        },
        authInfo,
    });

    const eventList = result.data.data.list || [];
    return eventList || [];
};

//market

export const fetchMarketPairInfo = async (
    { chainId, address, expiry }: FetchMarketPairInfoInput,
    authInfo: AuthInfo
): Promise<FetchMarketPairInfoResponse> => {
    const res = await axiosGet({
        url: API_URLS.MARKET.PAIR_INFO,
        config: { params: { chainId, address, expiry } },
        authInfo,
    });
    if (res?.data?.data) {
        const p = res?.data?.data;
        return {
            ...p,
            chainId: chainId,
        };
    }
    return null;
};
export const fetchMarketPairList = async (
    { chainId }: { chainId: number },
    authInfo: AuthInfo
): Promise<FetchMarketPairListResponse> => {
    const res = await axiosGet({ url: API_URLS.MARKET.PAIR_LIST, config: { params: { chainId } }, authInfo });
    if (res?.data?.data) {
        return res?.data?.data.map((p: IMarketPair) => {
            return {
                ...p,
                chainId: chainId,
                // id: getPairId(p.instrumentAddr, p.expiry),
            };
        });
    }
    return undefined;
};

function buildOnChainContextFromQuery(data: OnChainContextQueryResponseFromApi): PairSnapshot {
    const setting = normalizeSettingFromQuery(data.Setting);
    return new PairSnapshot({
        setting,
        condition: Number(data.Condition ?? 0) as Condition,
        amm: normalizeAmmFromQuery(data.Amm),
        priceData: normalizePriceDataFromQuery(data.PriceData),
        spacing: normalizeSpacingFromQuery(data.Spacing),
        blockInfo: normalizeBlockInfoFromQuery(data.BlockInfo),
        portfolio: data.Portfolio ? normalizePortfolioFromQuery(data.Portfolio) : PairSnapshot.emptyPortfolio(),
        quotation: data.Quotation ? normalizeQuotationFromQuery(data.Quotation) : undefined,
        quoteState: data.QuoteState
            ? normalizeQuoteStateFromQuery(data.QuoteState)
            : PairSnapshot.emptyQuoteState(setting.quote, setting.decimals, ''),
    });
}

function normalizeSettingFromQuery(raw: OnChainQuerySettingFromApi): Setting {
    const param = raw.Param;
    const fundingHour = Number(raw.FundingHour ?? 0);
    return {
        symbol: raw.Symbol,
        config: raw.Config,
        gate: raw.Gate,
        market: raw.Market,
        quote: raw.Quote,
        decimals: Number(raw.Decimals ?? 0),
        initialMarginRatio: Number(raw.InitialMarginRatio ?? 0),
        maintenanceMarginRatio: Number(raw.MaintenanceMarginRatio ?? 0),
        placePaused: Boolean(raw.PlacePaused),
        fundingHour: fundingHour > 0 ? fundingHour : DEFAULT_FUNDING_HOUR,
        disableOrderRebate: Boolean(raw.DisableOrderRebate),
        param: {
            minMarginAmount: toBigIntValue(param?.MinMarginAmount),
            tradingFeeRatio: Number(param?.TradingFeeRatio ?? 0),
            protocolFeeRatio: Number(param?.ProtocolFeeRatio ?? 0),
            qtype: Number(param?.Qtype ?? 0) as QuoteParam['qtype'],
            tip: toBigIntValue(param?.Tip),
        },
    };
}

function normalizeAmmFromQuery(raw: OnChainQueryAmmFromApi): Amm {
    return {
        expiry: Number(raw.Expiry ?? 0),
        timestamp: Number(raw.Timestamp ?? 0),
        status: Number(raw.Status ?? 0),
        tick: Number(raw.Tick ?? 0),
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

function normalizePriceDataFromQuery(raw: OnChainQueryPriceDataFromApi): PriceData {
    return {
        instrument: raw.Instrument ?? zeroAddress,
        expiry: Number(raw.Expiry ?? 0),
        markPrice: toBigIntValue(raw.MarkPrice),
        spotPrice: toBigIntValue(raw.SpotPrice),
        benchmarkPrice: toBigIntValue(raw.BenchmarkPrice),
        feeder0: raw.Feeder0 ?? zeroAddress,
        feeder1: raw.Feeder1 ?? zeroAddress,
        feeder0UpdatedAt: toBigIntValue(raw.Feeder0UpdatedAt),
        feeder1UpdatedAt: toBigIntValue(raw.Feeder1UpdatedAt),
    };
}

function normalizePortfolioFromQuery(raw?: OnChainQueryPortfolioFromApi | null): Portfolio {
    if (!raw) {
        return PairSnapshot.emptyPortfolio();
    }

    const position = normalizePositionFromQuery(raw.Position);
    const oids = Array.isArray(raw.Oids) ? raw.Oids.map((oid) => Number(oid ?? 0)) : [];
    const orders = Array.isArray(raw.Orders)
        ? raw.Orders.map((order, index) => {
            const oid = oids[index];
            if (oid === undefined) {
                throw new Error('Order oid is missing');
            }
            const { tick, nonce } = Order.unpackKey(oid);
            return normalizeOrderFromQuery(order, tick, nonce);
        })
        : [];
    const rids = Array.isArray(raw.Rids) ? raw.Rids.map((rid) => Number(rid ?? 0)) : [];
    const ranges = Array.isArray(raw.Ranges)
        ? raw.Ranges.map((range, index) => {
            const rid = rids[index];
            if (rid === undefined) {
                throw new Error('Range rid is missing');
            }
            const { tickLower, tickUpper } = Range.unpackKey(rid);
            return normalizeRangeFromQuery(range, tickLower, tickUpper);
        })
        : [];
    const ordersTaken = Array.isArray(raw.OrdersTaken) ? raw.OrdersTaken.map((value) => toBigIntValue(value)) : [];

    return {
        oids,
        rids,
        position,
        orders,
        ranges,
        ordersTaken,
    };
}

function normalizePositionFromQuery(raw?: OnChainQueryPositionFromApi | null): Position {
    if (!raw) {
        return Position.empty();
    }

    return new Position(
        toBigIntValue(raw.Balance),
        toBigIntValue(raw.Size),
        toBigIntValue(raw.EntryNotional),
        toBigIntValue(raw.EntrySocialLossIndex),
        toBigIntValue(raw.EntryFundingIndex)
    );
}

function normalizeOrderFromQuery(raw: OnChainQueryOrderFromApi, tick: number, nonce: number): Order {
    return new Order(toBigIntValue(raw.Balance), toBigIntValue(raw.Size), tick, nonce);
}

function normalizeRangeFromQuery(raw: OnChainQueryRangeFromApi, tickLower: number, tickUpper: number): Range {
    return new Range(
        toBigIntValue(raw.Liquidity),
        toBigIntValue(raw.EntryFeeIndex),
        toBigIntValue(raw.Balance),
        toBigIntValue(raw.SqrtEntryPX96),
        tickLower,
        tickUpper
    );
}

function normalizeQuotationFromQuery(raw: OnChainQueryQuotationFromApi): Quotation {
    return {
        benchmark: toBigIntValue(raw.Benchmark),
        sqrtFairPX96: toBigIntValue(raw.SqrtFairPX96),
        tick: Number(raw.Tick ?? 0),
        mark: toBigIntValue(raw.Mark),
        entryNotional: toBigIntValue(raw.EntryNotional),
        fee: toBigIntValue(raw.Fee),
        minAmount: toBigIntValue(raw.MinAmount),
        sqrtPostFairPX96: toBigIntValue(raw.SqrtPostFairPX96),
        postTick: Number(raw.PostTick ?? 0),
    };
}

function normalizeQuoteStateFromQuery(raw: OnChainQueryQuoteStateFromApi): QuoteState {
    return {
        quote: raw.Quote ?? zeroAddress,
        decimals: Number(raw.Decimals ?? 0),
        symbol: raw.Symbol ?? '',
        threshold: toBigIntValue(raw.Threshold),
        reserve: toBigIntValue(raw.Reserve),
        balance: toBigIntValue(raw.Balance),
        allowance: toBigIntValue(raw.Allowance),
        fundFlow: {
            totalIn: toBigIntValue(raw.FundFlow?.TotalIn),
            totalOut: toBigIntValue(raw.FundFlow?.TotalOut),
        },
        pending: {
            timestamp: Number(raw.Pending?.Timestamp ?? 0),
            native: Boolean(raw.Pending?.Native),
            amount: toBigIntValue(raw.Pending?.Amount),
            exemption: toBigIntValue(raw.Pending?.Exemption),
        },
    };
}

function normalizeSpacingFromQuery(raw: OnChainQuerySpacingFromApi): SpacingConfig {
    return {
        pearl: Number(raw.Pearl ?? 0),
        order: Number(raw.Order ?? 0),
        range: Number(raw.Range ?? 0),
    };
}

function normalizeBlockInfoFromQuery(raw: OnChainQueryBlockInfoFromApi): BlockInfo {
    return {
        timestamp: Number(raw.Timestamp ?? 0),
        height: Number(raw.Height ?? 0),
    };
}

const SCI_NOTATION_REGEX = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

function toBigIntValue(value: Bigintish | null | undefined): bigint {
    if (value === null || value === undefined) {
        return 0n;
    }
    if (typeof value === 'bigint') {
        return value;
    }

    const normalized = `${value}`.trim();
    if (!normalized) {
        return 0n;
    }

    const scientific = normalizeScientificToBigInt(normalized);
    if (scientific !== null) {
        return scientific;
    }

    const integerString = normalized.includes('.') ? normalized.split('.')[0] || '0' : normalized;
    if (!integerString || integerString === '-' || integerString === '+') {
        return 0n;
    }

    try {
        return BigInt(integerString);
    } catch {
        return 0n;
    }
}

function normalizeScientificToBigInt(value: string): bigint | null {
    const match = value.match(SCI_NOTATION_REGEX);
    if (!match) {
        return null;
    }

    const [, sign, integerPart, fractional = '', exponentStr] = match;
    const digits = (integerPart + fractional).replace(/^0+/, '') || '0';
    const exponent = Number(exponentStr) - fractional.length;
    let normalizedDigits = digits;

    if (exponent >= 0) {
        normalizedDigits = normalizedDigits + '0'.repeat(exponent);
    } else {
        const cutIndex = normalizedDigits.length + exponent;
        if (cutIndex <= 0) {
            normalizedDigits = '0';
        } else {
            normalizedDigits = normalizedDigits.slice(0, cutIndex);
        }
    }

    if (normalizedDigits === '0') {
        return 0n;
    }

    return BigInt(`${sign === '-' ? '-' : ''}${normalizedDigits}`);
}
