import { API_URLS } from './constants';
import type {
    FetchFuturesInstrumentInput,
    FetchFuturesInstrumentResponse,
    FetchFuturesInstrumentInquireInput,
    FetchFuturesInstrumentInquireResponse,
    FetchFuturesInstrumentInquireByTickInput,
    FetchFuturesInstrumentInquireByTickResponse,
    FetchFuturesInstrumentInquireByNotionalInput,
    FetchFuturesInstrumentInquireByNotionalResponse,
    FetchGateBalanceResponse,
    FetchGateBalanceInput,
    FetchOnChainContextInput,
    FetchOnChainContextResponse,
    TotalValueRequest,
    TotalValueResponse,
    FetchFuturesPairOrderBookInput,
    FetchFuturesPairOrderBookResponse,
    FetchFuturesPairKlineChartInput,
    FetchFuturesPairDepthChartInput,
    FetchFuturesPairDepthChartResponse,
    KlineDataFromApi,
    FetchFuturesPairKlineChartResponse,
    FetchMarketPairInfoInput,
    FetchMarketPairInfoResponse,
    FetchMarketPairListResponse,
    IMarketPair,
    FetchOnChainContextQueryInput,
    FetchOnChainContextQueryResponse,
    ApiSigner,
} from './interfaces';
import { HttpClient } from '../utils';
import { buildOnChainContextFromQuery } from './utils';
import { getDepthRangeDataByLiquidityDetails } from '../frontend/chart';
import { ApiEnvelope, BaseApiModule, getApiData } from './base';
import {
    decodeDepthChartLiquidityDetails,
    decodeFuturesInstrument,
    decodeGateBalances,
    decodeOrderBookSteps,
    decodePortfolioList,
    decodePriceData,
    decodeQuotation,
    decodeQuotationWithSize,
    decodeQuoteState,
} from './decoders';
import { requireRecord } from './codecs';

/**
 * MarketModule - Market API endpoints
 */
export class MarketModule extends BaseApiModule {
    constructor(httpClient: HttpClient, signer: ApiSigner) {
        super(httpClient, signer);
    }

    /**
     * Fetch futures instrument
     */
    async fetchFuturesInstrument(params: FetchFuturesInstrumentInput): Promise<FetchFuturesInstrumentResponse> {
        const requestUrl = API_URLS.MARKET.INSTRUMENT;
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, params);
        const rawData = getApiData(res);

        if (rawData !== null) {
            return decodeFuturesInstrument(rawData);
        }
        return null;
    }

    /**
     * Fetch market on-chain context
     */
    async fetchMarketOnChainContext(params: FetchOnChainContextInput): Promise<FetchOnChainContextResponse | null> {
        const requestUrl = API_URLS.MARKET.ONCHAIN_CONTEXT;
        const requestParams = {
            chainId: params.chainId,
            instrument: params.instrument,
            expiry: params.expiry,
            ...(params.userAddress ? { userAddress: params.userAddress } : {}),
            ...(params.signedSize !== undefined ? { signedSize: params.signedSize } : {}),
        };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);
        const rawData = getApiData(res);
        if (rawData === null) {
            return null;
        }

        const payload = requireRecord(rawData, 'market on-chain context');
        const { instrument: instrumentData, inquireRes, portfolioRes, priceData, quoteState } = payload;

        const normalizedInstrument = instrumentData == null ? null : decodeFuturesInstrument(instrumentData);

        const normalizedQuotation = inquireRes == null ? null : decodeQuotation(inquireRes);

        const normalizedPortfolio = portfolioRes == null ? null : decodePortfolioList(portfolioRes);

        const normalizedPriceData = priceData == null ? null : decodePriceData(priceData);

        const normalizedQuoteState = quoteState == null ? null : decodeQuoteState(quoteState);

        return {
            instrument: normalizedInstrument,
            inquireRes: normalizedQuotation,
            portfolioRes: normalizedPortfolio,
            priceData: normalizedPriceData,
            quoteState: normalizedQuoteState,
        };
    }

    /**
     * Fetch market on-chain context query
     */
    async fetchMarketOnChainContextQuery(
        params: FetchOnChainContextQueryInput
    ): Promise<FetchOnChainContextQueryResponse> {
        const requestUrl = API_URLS.MARKET.ONCHAIN_CONTEXT_QUERY;
        const requestParams = {
            chainId: params.chainId,
            instrument: params.instrument,
            expiry: params.expiry,
            ...(params.userAddress ? { userAddress: params.userAddress } : {}),
            ...(params.signedSize !== undefined ? { signedSize: params.signedSize } : {}),
        };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);

        const rawData = getApiData(res);
        if (rawData === null) {
            return null;
        }

        return buildOnChainContextFromQuery(rawData);
    }

    /**
     * Fetch futures instrument inquire
     */
    async fetchFuturesInstrumentInquire(
        params: FetchFuturesInstrumentInquireInput
    ): Promise<FetchFuturesInstrumentInquireResponse> {
        const requestUrl = API_URLS.MARKET.INQUIRE;
        const requestParams = {
            chainId: params.chainId,
            instrument: params.instrument,
            expiry: params.expiry,
            size: params.size,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);
        const rawData = getApiData(res);
        if (rawData !== null) {
            return decodeQuotation(rawData);
        }
        return null;
    }

    /**
     * Fetch futures instrument inquire by tick
     */
    async fetchFuturesInstrumentInquireByTick(
        params: FetchFuturesInstrumentInquireByTickInput
    ): Promise<FetchFuturesInstrumentInquireByTickResponse> {
        const requestUrl = API_URLS.MARKET.INQUIRE_BY_TICK;
        const requestParams = {
            chainId: params.chainId,
            instrument: params.instrument,
            expiry: params.expiry,
            tick: params.tick,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);
        const rawData = getApiData(res);
        if (rawData !== null) {
            return decodeQuotationWithSize(rawData);
        }
        return null;
    }

    /**
     * Fetch futures instrument inquire by notional
     */
    async fetchFuturesInstrumentInquireByNotional(
        params: FetchFuturesInstrumentInquireByNotionalInput
    ): Promise<FetchFuturesInstrumentInquireByNotionalResponse> {
        const requestUrl = API_URLS.MARKET.INQUIRE_BY_NOTIONAL;
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, params);
        const rawData = getApiData(res);
        if (rawData !== null) {
            return decodeQuotationWithSize(rawData);
        }
        return null;
    }

    /**
     * Fetch futures pair order book
     */
    async fetchFuturesPairOrderBook(
        params: FetchFuturesPairOrderBookInput
    ): Promise<FetchFuturesPairOrderBookResponse> {
        const requestUrl = API_URLS.MARKET.ORDER_BOOK;
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, params);
        const rawData = getApiData(res);

        if (rawData !== null) {
            return decodeOrderBookSteps(rawData);
        }
        return null;
    }

    /**
     * Fetch user gate balance from API
     */
    async fetchUserGateBalance(params: FetchGateBalanceInput): Promise<FetchGateBalanceResponse> {
        const requestUrl = API_URLS.MARKET.GATE_BALANCE;
        const requestParams = {
            chainId: params.chainId,
            userAddress: params.userAddress,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);
        const rawData = getApiData(res);
        if (rawData !== null) {
            const payload = requireRecord(rawData, 'gate balance response');
            if (payload.portfolios !== undefined) {
                return decodeGateBalances(payload.portfolios);
            }
        }
        return null;
    }

    /**
     * Fetch user total value
     */
    async fetchUserTotalValue(params: TotalValueRequest): Promise<TotalValueResponse> {
        const requestUrl = API_URLS.MARKET.USER_VOLUME;
        const requestParams = {
            chainId: params.chainId,
            userAddress: params.userAddress,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<TotalValueResponse>>(requestUrl, requestParams);
        return getApiData(res) ?? undefined;
    }

    /**
     * Fetch futures pair kline chart
     */
    async fetchFuturesPairKlineChart(
        params: FetchFuturesPairKlineChartInput
    ): Promise<FetchFuturesPairKlineChartResponse> {
        const requestUrl = API_URLS.MARKET.KLINE_CHARTS;
        const requestParams = {
            chainId: params.chainId,
            instrument: params.instrument,
            expiry: params.expiry,
            interval: params.interval,
            ...(params.endTime && { endTime: params.endTime }),
            limit: params.limit ?? 1000,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<KlineDataFromApi[]>>(requestUrl, requestParams);
        const rawData = getApiData(res) ?? [];
        return rawData.map((d) => ({
            ...d,
            timestamp: d.openTimestamp,
        }));
    }

    /**
     * Fetch futures pair depth chart
     */
    async fetchFuturesPairDepthChart(
        params: FetchFuturesPairDepthChartInput
    ): Promise<FetchFuturesPairDepthChartResponse> {
        const requestUrl = API_URLS.MARKET.DEPTH_CHARTS;
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, params);
        const rawData = getApiData(res);
        if (rawData !== null) {
            const data = decodeDepthChartLiquidityDetails(rawData);
            const newData = getDepthRangeDataByLiquidityDetails(data, data.size, data.stepRatio);
            return newData;
        }
        return null;
    }

    /**
     * Fetch market pair info
     */
    async fetchMarketPairInfo(params: FetchMarketPairInfoInput): Promise<FetchMarketPairInfoResponse> {
        const requestUrl = API_URLS.MARKET.PAIR_INFO;
        const requestParams = {
            chainId: params.chainId,
            address: params.address,
            expiry: params.expiry,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<IMarketPair>>(requestUrl, requestParams);
        const p = getApiData(res);
        if (p !== null) {
            return {
                ...p,
                chainId: params.chainId,
            };
        }
        return null;
    }

    /**
     * Fetch market pair list
     */
    async fetchMarketPairList(params: { chainId: number }): Promise<FetchMarketPairListResponse> {
        const requestUrl = API_URLS.MARKET.PAIR_LIST;
        const requestParams = {
            chainId: params.chainId,
        };
        const res = await this.makeSignedRequest<ApiEnvelope<IMarketPair[]>>(requestUrl, requestParams);
        const data = getApiData(res);
        if (data !== null) {
            return data.map((p: IMarketPair) => {
                return {
                    ...p,
                    chainId: params.chainId,
                };
            });
        }
        return undefined;
    }
}
