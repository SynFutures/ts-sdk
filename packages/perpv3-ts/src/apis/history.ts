import { API_URLS, DEFAULT_HISTORY_PAGE_SIZE, DEFAULT_PAGE } from './constants';
import type {
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
    GetTransferHistoryItemResponse,
    ApiSigner,
    AccountBalanceHistory,
    FundingHistory,
    OrderHistory,
    TradeHistory,
    TransferHistory,
} from './interfaces';
import { HttpClient } from '../utils';
import { getStartEndTimeByRangeType } from '../frontend';
import { ApiEnvelope, BaseApiModule, getApiData } from './base';
import { requireRecord } from './codecs';

type ApiListData<T> = ApiEnvelope<{
    list?: T[] | null;
}>;

// Closed value sets the history service emits (backend indexer models).
const SIDES = ['long', 'short'] as const satisfies readonly TradeHistory['side'][];
const TRADE_TYPES = [
    'Market',
    'Limit',
    'Liquidity',
    'Liquidation',
    'Taker Over',
] as const satisfies readonly TradeHistory['typeString'][];
const ORDER_TYPES = ['place', 'filled', 'cancelled'] as const satisfies readonly OrderHistory['typeString'][];
const FUNDING_TYPES = ['pay', 'receive'] as const satisfies readonly FundingHistory['typeString'][];
const TRANSFER_TYPES = ['scatter', 'gather'] as const satisfies readonly TransferHistory['typeString'][];
const ACCOUNT_TYPES = ['deposit', 'withdraw'] as const satisfies readonly AccountBalanceHistory['typeString'][];

/** Reject history items whose enumerated fields carry values the typed response does not allow. */
function requireHistoryEnums<T>(
    list: T[] | null | undefined,
    endpoint: string,
    fields: Record<string, readonly string[]>
): T[] {
    return (list ?? []).map((item, index) => {
        const label = `${endpoint}.list[${index}]`;
        const record = requireRecord(item, label);
        for (const [field, allowed] of Object.entries(fields)) {
            const value = record[field];
            if (typeof value !== 'string' || !allowed.includes(value)) {
                throw new Error(`Invalid ${label}.${field}: unsupported value ${String(value)}`);
            }
        }
        return item;
    });
}

/**
 * HistoryModule - History API endpoints
 */
export class HistoryModule extends BaseApiModule {
    constructor(httpClient: HttpClient, signer: ApiSigner) {
        super(httpClient, signer);
    }

    /**
     * Fetch trade history
     */
    async fetchTradeHistory(params: GetTradeHistoryParams): Promise<GetTradeHistoryResponse> {
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

        const requestUrl = API_URLS.HISTORY.TRADE;
        const requestParams = {
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
        };
        type TradeHistoryItem = GetTradeHistoryResponse[number];
        const res = await this.makeSignedRequest<ApiListData<TradeHistoryItem>>(requestUrl, requestParams);
        const tradeHistoryList = requireHistoryEnums(getApiData(res)?.list, 'tradeHistory', {
            typeString: TRADE_TYPES,
            side: SIDES,
        });
        return tradeHistoryList.sort((a: TradeHistoryItem, b: TradeHistoryItem) => b.timestamp - a.timestamp);
    }

    /**
     * Fetch orders history
     */
    async fetchOrdersHistory(params: GetOrdersHistoryParams): Promise<GetOrdersHistoryResponse> {
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

        const requestUrl = API_URLS.HISTORY.ORDER;
        const requestParams = {
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
        };
        type OrderHistoryItem = GetOrdersHistoryResponse[number] & { timestamp?: number };
        const result = await this.makeSignedRequest<ApiListData<OrderHistoryItem>>(requestUrl, requestParams);
        const orderHistoryList = requireHistoryEnums(getApiData(result)?.list, 'ordersHistory', {
            typeString: ORDER_TYPES,
            side: SIDES,
        });
        const getOrderHistoryTimestamp = (value: OrderHistoryItem): number =>
            value.timestamp ?? value.placeTimestamp ?? 0;

        return orderHistoryList.sort(
            (a: OrderHistoryItem, b: OrderHistoryItem) => getOrderHistoryTimestamp(b) - getOrderHistoryTimestamp(a)
        );
    }

    /**
     * Fetch funding history
     */
    async fetchFundingHistory(params: GetFundingHistoryParams): Promise<GetFundingHistoryResponse> {
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
        const requestUrl = API_URLS.HISTORY.FUNDING;
        const requestParams = {
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
        };
        const result = await this.makeSignedRequest<ApiListData<GetFundingHistoryResponse[number]>>(
            requestUrl,
            requestParams
        );
        return requireHistoryEnums(getApiData(result)?.list, 'fundingHistory', { typeString: FUNDING_TYPES });
    }

    /**
     * Fetch transfer history
     */
    async fetchTransferHistory(params: GetTransferHistoryParams): Promise<GetTransferHistoryResponse> {
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

        const requestUrl = API_URLS.HISTORY.TRANSFER;
        const requestParams = {
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
        };

        const result = await this.makeSignedRequest<ApiListData<GetTransferHistoryItemResponse>>(
            requestUrl,
            requestParams
        );

        return requireHistoryEnums(getApiData(result)?.list, 'transferHistory', { typeString: TRANSFER_TYPES });
    }

    /**
     * Fetch liquidity history
     */
    async fetchLiquidityHistory(params: GetLiquidityHistoryParams): Promise<GetLiquidityHistoryResponse> {
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

        const requestUrl = API_URLS.HISTORY.LIQUIDITY;
        const requestParams = {
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
        };

        const result = await this.makeSignedRequest<ApiListData<GetLiquidityHistoryResponse[number]>>(
            requestUrl,
            requestParams
        );

        const eventList = getApiData(result)?.list ?? [];
        return eventList;
    }

    /**
     * Fetch account balance history
     */
    async fetchAccountBalanceHistory(
        params: GetAccountBalanceHistoryParams
    ): Promise<GetAccountBalanceHistoryResponse> {
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

        const requestUrl = API_URLS.HISTORY.ACCOUNT;
        const requestParams = {
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
        };

        const result = await this.makeSignedRequest<ApiListData<GetAccountBalanceHistoryResponse[number]>>(
            requestUrl,
            requestParams
        );

        return requireHistoryEnums(getApiData(result)?.list, 'accountBalanceHistory', { typeString: ACCOUNT_TYPES });
    }
}
