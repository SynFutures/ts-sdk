import type { AxiosResponse } from 'axios';
import { API_URLS, DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from './constants';
import type {
    FetchMmOrderBookInput,
    FetchMmOrderBookResponse,
    FetchMmWalletBalanceInput,
    FetchMmWalletBalanceResponse,
    FetchMmPositionListInput,
    FetchMmPositionListResponse,
    AuthInfo,
    FetchMmTickersResponse,
    FetchMmTickersInput,
    FetchMmAccountTransactionHistoryInput,
    FetchMmAccountTransactionHistoryResponse,
    FetchTradeHistoryInput,
    FetchTradeHistoryResponse,
    FetchMmFundingHistoryInput,
    FetchMmFundingHistoryResponse,
    FetchMmInstrumentInfoInput,
    FetchMmInstrumentInfoResponse,
    FetchMmKlineInput,
    FetchMmKlineResponse,
    FetchMmLiquidityListInput,
    FetchMmLiquidityListResponse,
    FetchMmLiquidityHistoryInput,
    FetchMmLiquidityHistoryResponse,
    FetchMmOrderHistoryInput,
    FetchMmOrderHistoryResponse,
    FetchMmOrderRealtimeInput,
    FetchMmOrderRealtimeResponse,
    FetchTokenCoinsWithSymbolResponse,
} from './interfaces';
import { HttpClient, getRequestUrlWithQuery, type QueryParams } from '../utils/axios';
import { ApiAuthSigner } from '../utils';
import { ApiEnvelope, getApiData, requireApiData } from './base';
import {
    decodeMmInstrumentInfoList,
    decodeMmPositionList,
    decodeMmWalletBalance,
    decodeOrderBookSteps,
} from './decoders';

/**
 * MarketMakerModule - Market Maker API endpoints
 */
export class MarketMakerModule {
    private readonly signer: ApiAuthSigner;

    constructor(
        private readonly httpClient: HttpClient,
        signerOrAuthInfo: ApiAuthSigner | AuthInfo
    ) {
        if (signerOrAuthInfo instanceof ApiAuthSigner) {
            this.signer = signerOrAuthInfo;
        } else {
            this.signer = new ApiAuthSigner(signerOrAuthInfo);
        }
    }

    /**
     * Make a signed GET request using ApiAuthSigner
     */
    private async makeSignedRequest<T>(
        url: string,
        params?: QueryParams,
        body?: string,
        contentType?: string
    ): Promise<AxiosResponse<T>> {
        const urlWithQuery = getRequestUrlWithQuery(url, params ?? {});
        const extraHeaders = await this.signer.sign('GET', urlWithQuery, body, contentType);
        return await this.httpClient.get<T>(urlWithQuery, {
            headers: {
                ...extraHeaders,
            },
        });
    }

    /**
     * Fetch MM server time
     */
    async fetchServerTime(): Promise<number> {
        const requestUrl = API_URLS.MM.MM_SERVER_TIME;
        const res = await this.makeSignedRequest<ApiEnvelope<number>>(requestUrl);
        return requireApiData(res, 'MM server time');
    }

    /**
     * Fetch MM order book
     */
    async fetchOrderBook(params: FetchMmOrderBookInput): Promise<FetchMmOrderBookResponse> {
        const requestUrl = API_URLS.MM.MM_ORDER_BOOK;
        const requestParams = {
            chainId: params.chainId,
            symbol: params.symbol,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);
        const rawData = getApiData(res);

        if (rawData !== null) {
            return decodeOrderBookSteps(rawData);
        }
        return null;
    }

    /**
     * Fetch MM wallet balance
     */
    async fetchWalletBalance(params: FetchMmWalletBalanceInput): Promise<FetchMmWalletBalanceResponse | null> {
        const requestUrl = API_URLS.MM.MM_WALLET_BALANCE;
        const requestParams = { chainId: params.chainId, address: params.address };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);

        const data = getApiData(res);
        if (data === null) {
            return null;
        }

        return decodeMmWalletBalance(data);
    }

    /**
     * Fetch MM position list
     */
    async fetchPositionList(params: FetchMmPositionListInput): Promise<FetchMmPositionListResponse | null> {
        const requestUrl = API_URLS.MM.MM_POSITION_LIST;
        const requestParams = { chainId: params.chainId, address: params.address };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);

        const data = getApiData(res);
        if (data === null) {
            return null;
        }

        return decodeMmPositionList(data);
    }

    /**
     * Fetch MM account transaction history
     */
    async fetchAccountTransactionHistory(
        params: FetchMmAccountTransactionHistoryInput
    ): Promise<FetchMmAccountTransactionHistoryResponse | null> {
        const requestUrl = API_URLS.MM.MM_ACCOUNT_TRANSACTION_HISTORY;
        const requestParams = {
            chainId: params.chainId,
            address: params.address,
            page: params.page ?? DEFAULT_PAGE,
            size: params.size ?? DEFAULT_PAGE_SIZE,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchMmAccountTransactionHistoryResponse>>(
            requestUrl,
            requestParams
        );
        return getApiData(res);
    }

    async fetchTradeHistory(params: FetchTradeHistoryInput): Promise<FetchTradeHistoryResponse | null> {
        const requestUrl = API_URLS.MM.MM_TRADE_HISTORY;
        const requestParams = {
            chainId: params.chainId,
            address: params.address,
            ...(params.symbol !== undefined && { symbol: params.symbol }),
            ...(params.startTime !== undefined && { startTime: params.startTime }),
            ...(params.endTime !== undefined && { endTime: params.endTime }),
            page: params.page ?? DEFAULT_PAGE,
            size: params.size ?? DEFAULT_PAGE_SIZE,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchTradeHistoryResponse>>(requestUrl, requestParams);
        return getApiData(res);
    }

    /**
     * Fetch MM tickets
     */
    async fetchTickers(params: FetchMmTickersInput): Promise<FetchMmTickersResponse | null> {
        const requestUrl = API_URLS.MM.MM_TICKERS;
        const requestParams = {
            chainId: params.chainId,
            ...(params.symbol !== undefined && { symbol: params.symbol }),
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchMmTickersResponse>>(requestUrl, requestParams);
        return getApiData(res);
    }

    /**
     * Fetch MM funding history
     * @param params FetchMmFundingHistoryInput
     * @returns FetchMmFundingHistoryResponse
     */
    async fetchFundingHistory(params: FetchMmFundingHistoryInput): Promise<FetchMmFundingHistoryResponse | null> {
        const requestUrl = API_URLS.MM.MM_FUNDING_HISTORY;
        const requestParams = {
            chainId: params.chainId,
            symbol: params.symbol,
            ...(params.startTime !== undefined && { startTime: params.startTime }),
            ...(params.endTime !== undefined && { endTime: params.endTime }),
            ...(params.limit !== undefined && { limit: params.limit }),
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchMmFundingHistoryResponse>>(requestUrl, requestParams);
        return getApiData(res);
    }

    /**
     * Fetch MM instrument info
     * @param params FetchMmInstrumentInfoInput
     * @returns FetchMmInstrumentInfoResponse
     */
    async fetchInstrumentInfo(params: FetchMmInstrumentInfoInput): Promise<FetchMmInstrumentInfoResponse | null> {
        const requestUrl = API_URLS.MM.MM_INSTRUMENT_INFO;
        const requestParams = {
            chainId: params.chainId,
            ...(params.symbol !== undefined && { symbol: params.symbol }),
        };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);
        const data = getApiData(res);
        if (data === null) {
            return null;
        }
        return decodeMmInstrumentInfoList(data);
    }

    /**
     * Fetch MM kline
     * @param params FetchMmKlineInput
     * @returns FetchMmKlineResponse
     */
    async fetchKline(params: FetchMmKlineInput): Promise<FetchMmKlineResponse | null> {
        const requestUrl = API_URLS.MM.MM_KLINE;
        const requestParams = {
            chainId: params.chainId,
            symbol: params.symbol,
            interval: params.interval,
            ...(params.start !== undefined && { start: params.start }),
            ...(params.end !== undefined && { end: params.end }),
            ...(params.limit !== undefined && { limit: params.limit }),
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchMmKlineResponse>>(requestUrl, requestParams);
        return getApiData(res);
    }

    /**
     * Fetch MM liquidity history
     * @param params FetchMmLiquidityHistoryInput
     * @returns FetchMmLiquidityHistoryResponse
     */
    async fetchLiquidityHistory(params: FetchMmLiquidityHistoryInput): Promise<FetchMmLiquidityHistoryResponse | null> {
        const requestUrl = API_URLS.MM.MM_LIQUIDITY_HISTORY;
        const requestParams = {
            chainId: params.chainId,
            address: params.address,
            ...(params.symbol !== undefined && { symbol: params.symbol }),
            ...(params.startTime !== undefined && { startTime: params.startTime }),
            ...(params.endTime !== undefined && { endTime: params.endTime }),
            page: params.page ?? DEFAULT_PAGE,
            size: params.size ?? DEFAULT_PAGE_SIZE,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchMmLiquidityHistoryResponse>>(
            requestUrl,
            requestParams
        );
        return getApiData(res);
    }

    /**
     * Fetch MM liquidity list
     * @param params GetLiquidityListInput
     * @returns GetLiquidityListResponse
     */
    async fetchLiquidityList(params: FetchMmLiquidityListInput): Promise<FetchMmLiquidityListResponse | null> {
        const requestUrl = API_URLS.MM.MM_LIQUIDITY_LIST;
        const requestParams = {
            chainId: params.chainId,
            address: params.address,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchMmLiquidityListResponse>>(requestUrl, requestParams);
        return getApiData(res);
    }

    /**
     * Fetch MM order history
     * @param params FetchMmOrderHistoryInput
     * @returns FetchMmOrderHistoryResponse
     */
    async fetchOrderHistory(params: FetchMmOrderHistoryInput): Promise<FetchMmOrderHistoryResponse | null> {
        const requestUrl = API_URLS.MM.MM_ORDER_HISTORY;
        const requestParams = {
            chainId: params.chainId,
            address: params.address,
            ...(params.symbol !== undefined && { symbol: params.symbol }),
            ...(params.startTime !== undefined && { startTime: params.startTime }),
            ...(params.endTime !== undefined && { endTime: params.endTime }),
            page: params.page ?? DEFAULT_PAGE,
            size: params.size ?? DEFAULT_PAGE_SIZE,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchMmOrderHistoryResponse>>(requestUrl, requestParams);
        return getApiData(res);
    }

    /**
     * Fetch MM order realtime
     * @param params FetchMmOrderRealtimeInput
     * @returns FetchMmOrderRealtimeResponse
     */
    async fetchOrderRealtime(params: FetchMmOrderRealtimeInput): Promise<FetchMmOrderRealtimeResponse | null> {
        const requestUrl = API_URLS.MM.MM_ORDER_REALTIME;
        const requestParams = {
            chainId: params.chainId,
            address: params.address,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<FetchMmOrderRealtimeResponse>>(requestUrl, requestParams);
        return getApiData(res);
    }

    /**
     * Fetch MM token coins with symbol
     * @returns FetchTokenCoinsWithSymbolResponse
     */
    async fetchTokenCoinsWithSymbol(): Promise<FetchTokenCoinsWithSymbolResponse | null> {
        const requestUrl = API_URLS.MM.MM_TOKEN_COINS_WITH_SYMBOL;
        const res = await this.makeSignedRequest<ApiEnvelope<FetchTokenCoinsWithSymbolResponse>>(requestUrl);
        return getApiData(res);
    }
}
