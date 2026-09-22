import { API_URLS } from './constants';
import type { FetchPortfolioListFromApiInput, FetchPortfolioListFromApiResponse, ApiSigner } from './interfaces';
import { HttpClient } from '../utils';
import { ApiEnvelope, BaseApiModule, getApiData } from './base';
import { decodePortfolioList } from './decoders';

/**
 * PublicModule - Public API endpoints
 */
export class PublicModule extends BaseApiModule {
    constructor(httpClient: HttpClient, signer: ApiSigner) {
        super(httpClient, signer);
    }

    /**
     * Fetch portfolio list from API
     */
    async fetchPortfolioList(
        params: FetchPortfolioListFromApiInput
    ): Promise<FetchPortfolioListFromApiResponse | null> {
        const requestUrl = API_URLS.PUBLIC.PORTFOLIO;
        const requestParams = {
            chainId: params.chainId,
            userAddress: params.userAddress,
            ...(params.instrumentAddress && { instrumentAddress: params.instrumentAddress }),
            ...(params.expiry && { expiry: params.expiry }),
        };
        const res = await this.makeSignedRequest<ApiEnvelope<unknown>>(requestUrl, requestParams);
        const rawData = getApiData(res);

        if (rawData !== null) {
            return decodePortfolioList(rawData);
        }
        return null;
    }
}
