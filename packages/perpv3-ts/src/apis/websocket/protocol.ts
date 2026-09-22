import type { Address } from 'viem';

export type PublicWsStreamMetadata = {
    chainId?: number;
    instrument?: Address;
    expiry?: number | string;
};

export type PublicWsRequestMethod = 'SUBSCRIBE' | 'UNSUBSCRIBE';

export type PublicWsAckMessage = {
    id: number;
    result: string;
};

export type PublicWsWireStreamMessage = PublicWsStreamMetadata & {
    stream: string;
    data?: unknown;
};

export type PublicWsWireMessage = PublicWsWireStreamMessage | PublicWsAckMessage;

export type PublicWsRequestResultEvent = {
    id: number;
    result: string;
    ok: boolean;
    method?: PublicWsRequestMethod;
    params?: Record<string, unknown>;
    sentAtMs?: number;
    receivedAtMs: number;
    latencyMs?: number;
};

export type PendingPublicWsRequest = {
    method: PublicWsRequestMethod;
    params: Record<string, unknown>;
    sentAtMs: number;
};

export type PublicWsRequestEnvelope = {
    id: number;
    method: PublicWsRequestMethod;
    params: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isPublicWsAckMessage(value: unknown): value is PublicWsAckMessage {
    if (!isRecord(value)) return false;
    return typeof value.id === 'number' && typeof value.result === 'string';
}

export function isPublicWsStreamMessage(value: unknown): value is PublicWsWireStreamMessage {
    if (!isRecord(value)) return false;
    return typeof value.stream === 'string';
}

export function buildWsRequestParams(params: object): Record<string, unknown> {
    const requestParams: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
        requestParams[key] = value;
    }

    const extra = requestParams.params;
    if ('params' in requestParams) {
        delete requestParams.params;
        if (isRecord(extra)) {
            Object.assign(requestParams, extra);
        }
    }

    return normalizeWsRequestParams(requestParams);
}

export function buildPublicWsRequest(
    id: number,
    method: PublicWsRequestMethod,
    params: object
): PublicWsRequestEnvelope {
    return {
        id,
        method,
        params: buildWsRequestParams(params),
    };
}

export function buildWsRequestResultEvent(
    message: PublicWsAckMessage,
    request?: PendingPublicWsRequest,
    receivedAtMs = Date.now()
): PublicWsRequestResultEvent {
    const normalizedResult = message.result.trim().toLowerCase();
    const ok = normalizedResult === 'success' || normalizedResult.startsWith('success');

    if (!request) {
        return {
            id: message.id,
            result: message.result,
            ok,
            receivedAtMs,
        };
    }

    return {
        id: message.id,
        method: request.method,
        params: request.params,
        result: message.result,
        ok,
        sentAtMs: request.sentAtMs,
        receivedAtMs,
        latencyMs: receivedAtMs - request.sentAtMs,
    };
}

function normalizeWsRequestParams(params: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...params };

    const instrument = normalized.instrument;
    if (typeof instrument === 'string') {
        normalized.instrument = instrument.toLowerCase();
    }

    const userAddress = normalized.userAddress;
    if (typeof userAddress === 'string') {
        normalized.userAddress = userAddress.toLowerCase();
    }

    const pairs = normalized.pairs;
    if (Array.isArray(pairs)) {
        normalized.pairs = pairs
            .filter((pair): pair is string => typeof pair === 'string')
            .map((pair) => pair.toLowerCase());
    }

    return normalized;
}

// Topic identity follows the normalized wire request, independent of object key order.
export function wsTopicKey(params: Record<string, unknown>): string {
    return JSON.stringify(params, (_key, value: unknown) =>
        isRecord(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value
    );
}

export function wsTopics(params: object): Record<string, unknown>[] {
    const wire = buildWsRequestParams(params);
    return Array.isArray(wire.pairs) ? wire.pairs.map((pair) => ({ ...wire, pairs: [pair] })) : [wire];
}
