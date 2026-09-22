import axios, { AxiosRequestConfig, AxiosResponse, AxiosInstance } from 'axios';
import { API_DOMAIN, API_DEFAULT_TIMEOUT, API_DEFAULT_RETRIES } from '../apis/constants';
import type { AuthInfo } from '../apis/interfaces';
import { ErrorCode, SynfError } from '../types/error';
import { APIHeaders, getHeaders } from './mm';

export type QueryParams = object;

type RetryableRequestConfig = AxiosRequestConfig & { _retryCount?: number };

function appendQueryParam(searchParams: URLSearchParams, key: string, value: unknown): void {
    if (value === null || value === undefined) {
        return;
    }
    searchParams.append(key, String(value));
}

/**
 * Get the sorted query string from the parameters
 * @param params - The parameters to get the sorted query string from
 * @returns The sorted query string
 */
export function getSortedQueryString(params: QueryParams): string {
    if (Object.keys(params).length === 0) {
        return '';
    }
    const pa = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                appendQueryParam(pa, key, item);
            }
            continue;
        }
        appendQueryParam(pa, key, value);
    }
    pa.sort();
    return pa.toString();
}

/**
 * Get the request path from the URL
 * @param url - The Full URL to get the request path from
 * @returns The request path from the URL
 */
export function getRequestUrlFromSortedQuery(url: string, sortedQuery: string): string {
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

/**
 * Get the request path from the full URL
 * @param url - The Full URL to get the request path from
 * @returns The request path from the URL
 */
export function getRequestPathFromUrl(url: string): string {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
}

function isMarketMakerEndpoint(url: string): boolean {
    try {
        const urlObj = new URL(url, API_DOMAIN);
        return urlObj.pathname.startsWith('/v4/public/mm');
    } catch {
        return url.startsWith('/v4/public/mm');
    }
}

// ============================================================================
// Axios Functions
// ============================================================================
export async function axiosGet<T = unknown>({
    url,
    config,
    authInfo,
    jwtToken,
}: {
    url: string;
    config?: AxiosRequestConfig;
    authInfo?: AuthInfo;
    jwtToken?: string;
}): Promise<AxiosResponse<T>> {
    const { params, ...restConfig } = config ?? {};
    if (params) {
        const sortedParams = getSortedQueryString(params);
        url += (url.includes('?') ? '&' : '?') + sortedParams;
    }
    if (!url.startsWith('http')) {
        url = API_DOMAIN + url;
    }
    let extraHeaders: APIHeaders | undefined;
    if (authInfo && isMarketMakerEndpoint(url)) {
        const requestPath = getRequestPathFromUrl(url);
        extraHeaders = await getHeaders({
            method: 'GET',
            requestPath,
            ...authInfo,
        });
    }
    const httpClient = new HttpClient();
    return await httpClient.get<T>(url, {
        ...restConfig,
        headers: {
            ...restConfig?.headers,
            ...(jwtToken ? { Authorization: jwtToken } : {}),
            ...extraHeaders,
        },
    });
}

/**
 * HttpClient config
 */
export interface HttpClientConfig {
    baseUrl?: string;
    timeout?: number;
    retries?: number;
}

/**
 * HttpClient
 * This class is used to make HTTP requests to the API.
 */
export class HttpClient {
    private readonly client: AxiosInstance;
    private readonly config: HttpClientConfig;

    constructor(config?: HttpClientConfig) {
        const baseUrl = config?.baseUrl ?? API_DOMAIN;
        this.config = {
            baseUrl,
            timeout: config?.timeout ?? API_DEFAULT_TIMEOUT,
            retries: config?.retries ?? API_DEFAULT_RETRIES,
        };

        this.client = axios.create({
            baseURL: this.config.baseUrl,
            timeout: this.config.timeout,
            headers: {
                accept: 'application/json',
            },
        });

        this.setupInterceptors();
    }

    private setupInterceptors(): void {
        this.client.interceptors.response.use(
            (response: AxiosResponse) => {
                return response;
            },
            async (error: unknown) => {
                const originalRequest = axios.isAxiosError(error)
                    ? (error.config as RetryableRequestConfig | undefined)
                    : undefined;
                const responseStatus = axios.isAxiosError(error) ? error.response?.status : undefined;

                // A failed response can follow a successful write; only repeat read-only requests.
                const method = originalRequest?.method?.toUpperCase() ?? 'GET';
                const retryable = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
                if (retryable && responseStatus !== undefined && responseStatus >= 500 && originalRequest) {
                    const maxRetries = this.config.retries ?? 3;
                    const retryCount = originalRequest._retryCount ?? 0;
                    if (retryCount >= maxRetries) {
                        throw this.handleError(error);
                    }

                    originalRequest._retryCount = retryCount + 1;

                    // Exponential backoff
                    const delay = Math.pow(2, originalRequest._retryCount) * 100;
                    await new Promise((resolve) => setTimeout(resolve, delay));

                    return this.client(originalRequest);
                }

                throw this.handleError(error);
            }
        );
    }

    private handleError(error: unknown): SynfError {
        if (axios.isAxiosError(error)) {
            // Server responded with error status
            const data = error.response?.data;
            const dataRecord = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
            const message =
                (typeof dataRecord?.message === 'string' && dataRecord.message) ||
                (typeof dataRecord?.error === 'string' && dataRecord.error) ||
                error.message;
            return new SynfError(message, ErrorCode.API_REQUEST_FAILED, {
                status: error.response?.status,
                data,
            });
        }

        if (error instanceof Error) {
            return new SynfError(error.message, ErrorCode.API_REQUEST_FAILED);
        }

        if (typeof error === 'object' && error !== null && 'request' in error) {
            // Request was made but no response received
            return new SynfError('Network error: No response received', ErrorCode.API_REQUEST_FAILED);
        }

        return new SynfError('Unknown HTTP error', ErrorCode.API_REQUEST_FAILED);
    }

    async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return await this.client.get(url, config);
    }

    async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return await this.client.post(url, data, config);
    }

    async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return await this.client.put(url, data, config);
    }

    async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return await this.client.delete(url, config);
    }
}
