// Re-export module classes
export { PublicModule } from './public';
export { MarketModule } from './market';
export { MarketMakerModule } from './mm';
export { TokenModule } from './token';
export { HistoryModule } from './history';

// Re-export utils
export * from './utils';

// Backward compatibility: export functions that use the modules
import { PublicModule } from './public';
import { MarketModule } from './market';
import { MarketMakerModule } from './mm';
import { TokenModule } from './token';
import { HistoryModule } from './history';
import { HttpClient } from '../utils';
import type {
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
    TotalValueRequest,
    TotalValueResponse,
    FetchFuturesPairOrderBookInput,
    FetchFuturesPairOrderBookResponse,
    FetchFuturesPairKlineChartInput,
    FetchFuturesPairDepthChartInput,
    FetchFuturesPairDepthChartResponse,
    AuthInfo,
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
    FetchMarketPairInfoInput,
    FetchMarketPairInfoResponse,
    FetchMarketPairListResponse,
    FetchOnChainContextQueryInput,
    FetchOnChainContextQueryResponse,
    FetchMmOrderBookInput,
    FetchMmOrderBookResponse,
    FetchMmWalletBalanceInput,
    FetchMmWalletBalanceResponse,
    FetchMmPositionListInput,
    FetchMmPositionListResponse,
    ApiSigner,
    FetchMmTickersResponse,
    FetchMmTickersInput,
    FetchMmAccountTransactionHistoryResponse,
    FetchMmAccountTransactionHistoryInput,
    FetchTradeHistoryResponse,
    FetchTradeHistoryInput,
    FetchMmFundingHistoryResponse,
    FetchMmFundingHistoryInput,
    FetchMmInstrumentInfoResponse,
    FetchMmInstrumentInfoInput,
    FetchMmKlineResponse,
    FetchMmKlineInput,
    FetchMmLiquidityListResponse,
    FetchMmLiquidityListInput,
    FetchMmLiquidityHistoryInput,
    FetchMmLiquidityHistoryResponse,
    FetchMmOrderHistoryResponse,
    FetchMmOrderHistoryInput,
    FetchMmOrderRealtimeResponse,
    FetchMmOrderRealtimeInput,
    FetchTokenCoinsWithSymbolResponse,
} from './interfaces';

// Create a HttpClient instance for backward compatibility
export const httpClient = new HttpClient();

// Market functions
export const fetchFuturesInstrument = async (
    params: FetchFuturesInstrumentInput,
    signer: ApiSigner,
): Promise<FetchFuturesInstrumentResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchFuturesInstrument(params);
};

export const fetchMarketOnChainContext = async (
    params: FetchOnChainContextInput,
    signer: ApiSigner,
    client: HttpClient = httpClient,
): Promise<FetchOnChainContextResponse | null> => {
    const market = new MarketModule(client, signer);
    return market.fetchMarketOnChainContext(params);
};

export const fetchMarketOnChainContextQuery = async (
    params: FetchOnChainContextQueryInput,
    signer: ApiSigner,
): Promise<FetchOnChainContextQueryResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchMarketOnChainContextQuery(params);
};

export const fetchFuturesInstrumentInquire = async (
    params: FetchFuturesInstrumentInquireInput,
    signer: ApiSigner,
    client: HttpClient = httpClient,
): Promise<FetchFuturesInstrumentInquireResponse> => {
    const market = new MarketModule(client, signer);
    return market.fetchFuturesInstrumentInquire(params);
};

export const fetchFuturesInstrumentInquireByTick = async (
    params: FetchFuturesInstrumentInquireByTickInput,
    signer: ApiSigner,
    client: HttpClient = httpClient,
): Promise<FetchFuturesInstrumentInquireByTickResponse> => {
    const market = new MarketModule(client, signer);
    return market.fetchFuturesInstrumentInquireByTick(params);
};

export const fetchFuturesInstrumentInquireByNotional = async (
    params: FetchFuturesInstrumentInquireByNotionalInput,
    signer: ApiSigner,
): Promise<FetchFuturesInstrumentInquireByNotionalResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchFuturesInstrumentInquireByNotional(params);
};

export const fetchFuturesPairOrderBook = async (
    params: FetchFuturesPairOrderBookInput,
    signer: ApiSigner,
    client: HttpClient = httpClient,
): Promise<FetchFuturesPairOrderBookResponse> => {
    const market = new MarketModule(client, signer);
    return market.fetchFuturesPairOrderBook(params);
};

export const fetchUserGateBalanceFromApi = async (
    params: FetchGateBalanceInput,
    signer: ApiSigner,
): Promise<FetchGateBalanceResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchUserGateBalance(params);
};

export const fetchUserTotalValue = async (
    params: TotalValueRequest,
    signer: ApiSigner,
): Promise<TotalValueResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchUserTotalValue(params);
};

export const fetchFuturesPairKlineChart = async (
    params: FetchFuturesPairKlineChartInput,
    signer: ApiSigner,
): Promise<FetchFuturesPairKlineChartResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchFuturesPairKlineChart(params);
};

export const fetchFuturesPairDepthChart = async (
    params: FetchFuturesPairDepthChartInput,
    signer: ApiSigner,
): Promise<FetchFuturesPairDepthChartResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchFuturesPairDepthChart(params);
};

export const fetchMarketPairInfo = async (
    params: FetchMarketPairInfoInput,
    signer: ApiSigner,
): Promise<FetchMarketPairInfoResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchMarketPairInfo(params);
};

export const fetchMarketPairList = async (
    params: { chainId: number },
    signer: ApiSigner,
): Promise<FetchMarketPairListResponse> => {
    const market = new MarketModule(httpClient, signer);
    return market.fetchMarketPairList(params);
};

// Public functions
export const fetchPortfolioListFromApi = async (
    params: FetchPortfolioListFromApiInput,
    signer: ApiSigner
): Promise<FetchPortfolioListFromApiResponse | null> => {
    const publicModule = new PublicModule(httpClient, signer);
    return publicModule.fetchPortfolioList(params,);
};

// MM functions
export const fetchMmServerTime = async (authInfo: AuthInfo): Promise<number> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchServerTime();
};

export const fetchMmTickers = async (
    params: FetchMmTickersInput,
    authInfo: AuthInfo
): Promise<FetchMmTickersResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchTickers(params);
};

export const fetchMmAccountTransactionHistory = async (
    params: FetchMmAccountTransactionHistoryInput,
    authInfo: AuthInfo
): Promise<FetchMmAccountTransactionHistoryResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchAccountTransactionHistory(params);
};

export const fetchMmTradeHistory = async (
    params: FetchTradeHistoryInput,
    authInfo: AuthInfo
): Promise<FetchTradeHistoryResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchTradeHistory(params);
};

export const fetchMmFundingHistory = async (
    params: FetchMmFundingHistoryInput,
    authInfo: AuthInfo
): Promise<FetchMmFundingHistoryResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchFundingHistory(params);
};

export const fetchMmInstrumentInfo = async (
    params: FetchMmInstrumentInfoInput,
    authInfo: AuthInfo
): Promise<FetchMmInstrumentInfoResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchInstrumentInfo(params);
};

export const fetchMmKline = async (
    params: FetchMmKlineInput,
    authInfo: AuthInfo
): Promise<FetchMmKlineResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchKline(params);
};

export const fetchMmLiquidityHistory = async (
    params: FetchMmLiquidityHistoryInput,
    authInfo: AuthInfo
): Promise<FetchMmLiquidityHistoryResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchLiquidityHistory(params);
};

export const fetchMmLiquidityList = async (
    params: FetchMmLiquidityListInput,
    authInfo: AuthInfo
): Promise<FetchMmLiquidityListResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchLiquidityList(params);
};


export const fetchMmOrderHistory = async (
    params: FetchMmOrderHistoryInput,
    authInfo: AuthInfo
): Promise<FetchMmOrderHistoryResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchOrderHistory(params);
};

export const fetchMmOrderRealtime = async (
    params: FetchMmOrderRealtimeInput,
    authInfo: AuthInfo
): Promise<FetchMmOrderRealtimeResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchOrderRealtime(params);
};

export const fetchTokenCoinsWithSymbol = async (
    authInfo: AuthInfo
): Promise<FetchTokenCoinsWithSymbolResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchTokenCoinsWithSymbol();
};

export const fetchMmOrderBook = async (
    params: FetchMmOrderBookInput,
    authInfo: AuthInfo
): Promise<FetchMmOrderBookResponse> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchOrderBook(params);
};

export const fetchMmWalletBalance = async (
    params: FetchMmWalletBalanceInput,
    authInfo: AuthInfo
): Promise<FetchMmWalletBalanceResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchWalletBalance(params);
};

export const fetchMmPositionList = async (
    params: FetchMmPositionListInput,
    authInfo: AuthInfo
): Promise<FetchMmPositionListResponse | null> => {
    const mm = new MarketMakerModule(httpClient, authInfo);
    return mm.fetchPositionList(params);
};

// Token functions
export const fetchTokenPriceMapFromApi = async (
    params: FetchTokenPriceMapInput,
    signer: ApiSigner
): Promise<FetchTokenPriceMapResponse> => {
    const token = new TokenModule(httpClient, signer);
    return token.fetchTokenPriceMap(params);
};

// History functions
export const fetchTradeHistory = async (
    params: GetTradeHistoryParams,
    signer: ApiSigner
): Promise<GetTradeHistoryResponse> => {
    const history = new HistoryModule(httpClient, signer);
    return history.fetchTradeHistory(params);
};

export const fetchOrdersHistory = async (
    params: GetOrdersHistoryParams,
    signer: ApiSigner
): Promise<GetOrdersHistoryResponse> => {
    const history = new HistoryModule(httpClient, signer);
    return history.fetchOrdersHistory(params);
};

export const fetchFundingHistory = async (
    params: GetFundingHistoryParams,
    signer: ApiSigner
): Promise<GetFundingHistoryResponse> => {
    const history = new HistoryModule(httpClient, signer);
    return history.fetchFundingHistory(params);
};

export const fetchTransferHistory = async (
    params: GetTransferHistoryParams,
    signer: ApiSigner
): Promise<GetTransferHistoryResponse> => {
    const history = new HistoryModule(httpClient, signer);
    return history.fetchTransferHistory(params);
};

export const fetchLiquidityHistory = async (
    params: GetLiquidityHistoryParams,
    signer: ApiSigner
): Promise<GetLiquidityHistoryResponse> => {
    const history = new HistoryModule(httpClient, signer);
    return history.fetchLiquidityHistory(params);
};

export const fetchAccountBalanceHistory = async (
    params: GetAccountBalanceHistoryParams,
    signer: ApiSigner
): Promise<GetAccountBalanceHistoryResponse> => {
    const history = new HistoryModule(httpClient, signer);
    return history.fetchAccountBalanceHistory(params);
};
