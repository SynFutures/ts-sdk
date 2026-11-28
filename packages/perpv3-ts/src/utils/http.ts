import { API_DOMAIN, API_DEFAULT_TIMEOUT, API_DEFAULT_RETRIES } from '../apis/constants';
import { isRecord, parseJsonPreservingLargeIntegers } from '../apis/codecs';
import { ErrorCode, SynfError } from '../types/error';

export type QueryParams = object;

function getSortedQueryString(params: QueryParams): string {
    if (Object.keys(params).length === 0) {
        return '';
    }
    const pa = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined) continue;
        pa.append(key, String(value));
    }
    pa.sort();
    return pa.toString();
}

/**
 * Get the request path from the URL
 * @param url - The Full URL to get the request path from
 * @returns The request path from the URL
 */
function getRequestUrlFromSortedQuery(url: string, sortedQuery: string): string {
    if (!sortedQuery) {
        return url;
    }
    return url + (url.includes('?') ? '&' : '?') + sortedQuery;
}

/**
 *
 * @param url - The base URL to get the request URL from
 * @param params - The parameters to get the request URL from
 * @returns
 */

export function getRequestUrlWithQuery(url: string, params: QueryParams): string {
    const sortedQuery = getSortedQueryString(params);
    return getRequestUrlFromSortedQuery(url, sortedQuery);
}

export interface HttpClientConfig {
    baseUrl?: string;
    timeout?: number;
    retries?: number;
    fetch?: typeof fetch;
}

export interface HttpResponse<T> {
    status: number;
    data: T;
}

export interface HttpRequestOptions {
    headers?: Record<string, string | number | undefined>;
    signal?: AbortSignal;
}

export class HttpClient {
    constructor(private readonly config: HttpClientConfig = {}) {}

    private resolveUrl(path: string): URL {
        return new URL(path.replace(/^\//, ''), (this.config.baseUrl ?? API_DOMAIN).replace(/\/?$/, '/'));
    }

    requestPath(path: string): string {
        const url = this.resolveUrl(path);
        return url.pathname + url.search;
    }

    private async request<T>(
        method: string,
        path: string,
        data?: unknown,
        options: HttpRequestOptions = {}
    ): Promise<HttpResponse<T>> {
        const url = this.resolveUrl(path);
        const headers = new Headers({ accept: 'application/json' });
        if (data !== undefined) headers.set('content-type', 'application/json');
        for (const [key, value] of Object.entries(options.headers ?? {})) {
            if (value !== undefined) headers.set(key, String(value));
        }
        try {
            const body = typeof data === 'string' ? data : JSON.stringify(data);
            const timeout = this.config.timeout ?? API_DEFAULT_TIMEOUT;
            const retries = this.config.retries ?? API_DEFAULT_RETRIES;
            for (let attempt = 0; ; attempt++) {
                const signals = options.signal ? [options.signal] : [];
                if (timeout > 0) signals.push(AbortSignal.timeout(timeout));
                const response = await (this.config.fetch ?? fetch)(url, {
                    method,
                    headers,
                    body,
                    signal: AbortSignal.any(signals),
                    redirect: 'error',
                });
                const text = await response.text();
                if (method === 'GET' && response.status >= 500 && attempt < retries) {
                    await new Promise((resolve) => setTimeout(resolve, 2 ** (attempt + 1) * 100));
                    continue;
                }
                let payload: unknown = text;
                try {
                    payload = parseJsonPreservingLargeIntegers(text);
                } catch {
                    /* Non-JSON errors retain their response body. */
                }
                if (!response.ok) {
                    const message =
                        isRecord(payload) &&
                        [payload.msg, payload.message, payload.error].find((v) => typeof v === 'string' && v);
                    throw new SynfError(
                        typeof message === 'string' ? message : `HTTP ${response.status}`,
                        ErrorCode.API_REQUEST_FAILED,
                        { status: response.status, data: payload }
                    );
                }
                return { status: response.status, data: payload as T };
            }
        } catch (error) {
            if (error instanceof SynfError) throw error;
            throw new SynfError(
                error instanceof Error ? error.message : 'HTTP request failed',
                ErrorCode.API_REQUEST_FAILED
            );
        }
    }

    get<T = unknown>(url: string, options?: HttpRequestOptions) {
        return this.request<T>('GET', url, undefined, options);
    }
    delete<T = unknown>(url: string, options?: HttpRequestOptions) {
        return this.request<T>('DELETE', url, undefined, options);
    }
    post<T = unknown>(url: string, data?: unknown, options?: HttpRequestOptions) {
        return this.request<T>('POST', url, data, options);
    }
    put<T = unknown>(url: string, data?: unknown, options?: HttpRequestOptions) {
        return this.request<T>('PUT', url, data, options);
    }
}

export const defaultHttpClient = new HttpClient();
