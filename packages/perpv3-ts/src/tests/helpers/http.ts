import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ApiEnvelope } from '../../apis/base';

export function axiosResponse<T>(data: T): AxiosResponse<T> {
    return {
        data,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config: {
            headers: new AxiosHeaders(),
        },
    };
}

export function apiEnvelopeResponse<T>(data: T | null): AxiosResponse<ApiEnvelope<T>> {
    return axiosResponse({ data });
}
