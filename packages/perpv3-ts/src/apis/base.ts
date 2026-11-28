import type { HttpRequestOptions, HttpResponse } from '../utils/http';
import { isRecord } from './codecs';
import type { ApiSigner } from './interfaces';
import { getRequestUrlWithQuery, HttpClient, type QueryParams } from '../utils/http';
import { ErrorCode, SynfError } from '../types/error';

export type ApiEnvelope<T> = {
    /** 0 on success; the server reports business errors with HTTP 200 and a non-zero code. */
    code: number;
    msg?: string;
    data: T | null;
};

export function getApiData<T>(response: HttpResponse<ApiEnvelope<T>>): T | null {
    const envelope = response.data;
    if (!isRecord(envelope) || !Number.isSafeInteger(envelope.code)) {
        throw new SynfError(
            'Invalid API response envelope: expected an object with an integer code',
            ErrorCode.API_REQUEST_FAILED
        );
    }
    if (envelope.code !== 0) {
        throw new SynfError(
            (typeof envelope.msg === 'string' && envelope.msg) || `API error code ${envelope.code}`,
            ErrorCode.API_REQUEST_FAILED,
            {
                status: response.status,
                data: envelope,
            }
        );
    }
    if (!Object.hasOwn(envelope, 'data') || envelope.data === undefined) {
        throw new SynfError('Invalid API response envelope: missing data', ErrorCode.API_REQUEST_FAILED);
    }
    return envelope.data;
}

export function requireApiData<T>(response: HttpResponse<ApiEnvelope<T>>, label: string): T {
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
        config: Omit<HttpRequestOptions, 'headers'> = {}
    ): Promise<HttpResponse<T>> {
        const urlWithQuery = getRequestUrlWithQuery(url, params);
        const extraHeaders = this.signer.sign({
            uri: this.httpClient.requestPath(urlWithQuery),
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
