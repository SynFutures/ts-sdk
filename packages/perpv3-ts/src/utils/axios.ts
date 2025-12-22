import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getHeaders } from './mm';
import { API_DOMAIN } from '../apis/constants';
import type { AuthInfo } from '../apis/interfaces';

/**
 * Get the request path from the URL
 * @param url - The Full URL to get the request path from
 * @returns The request path from the URL
 */
export function getRequestPathFromUrl(url: string): string {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
}

// ============================================================================
// Axios Functions
// ============================================================================

export async function axiosGet({
    url,
    config,
    jwtToken,
    authInfo,
}: {
    url: string;
    config?: AxiosRequestConfig;
    domain?: string;
    authInfo?: AuthInfo;
    jwtToken?: string;
}): Promise<AxiosResponse> {
    // need move params to url for encrypted

    if (config?.params) {
        const pa = new URLSearchParams(config.params);
        pa.sort();
        const params = pa.toString();
        url += (url.includes('?') ? '&' : '?') + params;
        config.params = undefined;
    }
    if (!url.startsWith(API_DOMAIN)) {
        url = API_DOMAIN + url;
    }
    const requestPath = getRequestPathFromUrl(url);
    let extraHeaders;
    if (authInfo) {
        extraHeaders = await getHeaders({
            method: 'GET',
            requestPath,
            ...authInfo,
        });
    }

    return await axios.get(url, {
        ...config,
        headers: {
            ...config?.headers,
            Authorization: jwtToken,
            ...extraHeaders,
        },
    });
}

// ============================================================================
// Utility Functions
// ============================================================================

export function bigInitObjectCheckByKeys(obj: any, bigIntKeys?: string[]): any {
    if (!bigIntKeys || bigIntKeys.length === 0) {
        return obj;
    }
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj;
    }

    const cloneObj = Array.isArray(obj) ? [...obj] : { ...obj };
    if (cloneObj) {
        try {
            Object.keys(cloneObj).forEach((key) => {
                const val = cloneObj[key];
                // If bigNumberKeys is provided, only convert keys that are in the array
                if (bigIntKeys?.includes(key)) {
                    cloneObj[key] = BigInt(val || 0);
                } else if (typeof val === 'object' && val && Object.keys(val).length > 0) {
                    const newVal = bigInitObjectCheckByKeys(val, bigIntKeys);
                    cloneObj[key] = newVal;
                }
            });
        } catch {
            // Silently handle conversion errors and return the original cloned object
            // This prevents the function from throwing while maintaining data integrity
        }
    }
    return cloneObj;
}
