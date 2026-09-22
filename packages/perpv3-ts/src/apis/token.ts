import { API_URLS } from './constants';
import type { ApiSigner, FetchTokenPriceMapInput, FetchTokenPriceMapResponse, TokenPriceFromApi } from './interfaces';
import { HttpClient } from '../utils';
import { ApiEnvelope, BaseApiModule, getApiData } from './base';

/**
 * TokenModule - Token API endpoints
 */
export class TokenModule extends BaseApiModule {
    constructor(httpClient: HttpClient, signer: ApiSigner) {
        super(httpClient, signer);
    }

    /**
     * Fetch token price map from API
     */
    async fetchTokenPriceMap(params: FetchTokenPriceMapInput): Promise<FetchTokenPriceMapResponse> {
        const requestUrl = API_URLS.TOKEN.TOKEN_ALL_PRICE;
        const response = await this.makeSignedRequest<ApiEnvelope<TokenPriceFromApi[]>>(requestUrl, params);
        const tokenPriceMap = Object.fromEntries((getApiData(response) ?? []).map((item) => [item.address, item]));

        return tokenPriceMap;
    }
}
