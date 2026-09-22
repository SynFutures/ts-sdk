import type { AxiosResponse } from 'axios';
import type { ApiSigner } from './interfaces';
import { getRequestUrlWithQuery, HttpClient, type QueryParams } from '../utils/axios';

export type ApiEnvelope<T> = {
    data?: T | null;
};

export function getApiData<T>(response: AxiosResponse<ApiEnvelope<T>>): T | null {
    return response.data?.data ?? null;
}

export function requireApiData<T>(response: AxiosResponse<ApiEnvelope<T>>, label: string): T {
    const data = getApiData(response);
    if (data === null) {
        throw new Error(`Missing API response data for ${label}`);
    }
    return data;
}

/**
 * BaseApiModule - Base class for API modules that use ApiSigner
 * Provides common functionality for making signed requests
 */
export abstract class BaseApiModule {
    constructor(
        protected readonly httpClient: HttpClient,
        protected readonly signer: ApiSigner
    ) {}

    /**
     * Helper method to make a signed GET request
     */
    protected async makeSignedRequest<T>(url: string, params: QueryParams): Promise<AxiosResponse<T>> {
        const urlWithQuery = getRequestUrlWithQuery(url, params);
        const extraHeaders = this.signer.sign({
            uri: urlWithQuery,
            ts: Date.now(),
        });
        return await this.httpClient.get<T>(urlWithQuery, {
            headers: {
                ...extraHeaders,
            },
        });
    }
}
