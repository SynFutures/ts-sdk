import type { HttpResponse } from '../../utils/http';
import type { ApiEnvelope } from '../../apis/base';

export function httpResponse<T>(data: T): HttpResponse<T> {
    return { data, status: 200 };
}

export function apiEnvelopeResponse<T>(data: T | null): HttpResponse<ApiEnvelope<T>> {
    return httpResponse({ code: 0, data });
}
