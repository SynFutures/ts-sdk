import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiSigner } from './interfaces';
import { getRequestUrlWithQuery, HttpClient, type QueryParams } from '../utils/axios';
import { ErrorCode, SynfError } from '../types/error';

export type ApiEnvelope<T> = {
    /** 0 on success; the server reports business errors with HTTP 200 and a non-zero code. */
    code?: number;
    msg?: string;
    data?: T | null;
};

export function getApiData<T>(response: AxiosResponse<ApiEnvelope<T>>): T | null {
    const envelope = response.data;
    if (typeof envelope?.code === 'number' && envelope.code !== 0) {
        throw new SynfError(envelope.msg || `API error code ${envelope.code}`, ErrorCode.API_REQUEST_FAILED, {
            status: response.status,
            data: envelope,
        });
    }
    return envelope?.data ?? null;
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
    protected async makeSignedRequest<T>(
        url: string,
        params: QueryParams,
        config: Omit<AxiosRequestConfig, 'headers'> = {}
    ): Promise<AxiosResponse<T>> {
        const urlWithQuery = getRequestUrlWithQuery(url, params);
        const extraHeaders = this.signer.sign({
            uri: urlWithQuery,
            ts: Date.now(),
        });
        return await this.httpClient.get<T>(urlWithQuery, {
            ...config,
            headers: {
                ...extraHeaders,
            },
        });
    }
}
