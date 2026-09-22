export type WebSocketFactory = (url: string, options?: { headers?: Record<string, string> }) => WebSocketLike;
export type WebSocketCtor = new (
    url: string,
    protocols?: string | string[] | Record<string, unknown>,
    options?: Record<string, unknown>
) => WebSocketLike;
export type WebSocketEventName = 'open' | 'message' | 'error' | 'close';
export type WebSocketEventHandler = (...args: unknown[]) => void;
type WebSocketEventProperty = `on${WebSocketEventName}`;

export interface WebSocketLike extends Partial<Record<WebSocketEventProperty, WebSocketEventHandler>> {
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener?: (event: WebSocketEventName, handler: WebSocketEventHandler) => void;
    removeEventListener?: (event: WebSocketEventName, handler: WebSocketEventHandler) => void;
    on?: (event: WebSocketEventName, handler: WebSocketEventHandler) => void;
}

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const WS_READY_STATE = {
    CONNECTING: 0,
    OPEN: 1,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const num = typeof value === 'string' ? Number(value) : (value as number);
    return Number.isFinite(num) ? num : undefined;
}

export function buildWebSocketHeaders(url: string, overrides?: Record<string, string>): Record<string, string> {
    const urlObj = new URL(url);
    const origin =
        urlObj.protocol === 'wss:'
            ? `https://${urlObj.host}`
            : urlObj.protocol === 'ws:'
              ? `http://${urlObj.host}`
              : `${urlObj.protocol}//${urlObj.host}`;

    return {
        'User-Agent': DEFAULT_USER_AGENT,
        Origin: origin,
        ...overrides,
    };
}

export function createWebSocket(
    url: string,
    headers: Record<string, string>,
    wsFactory?: WebSocketFactory
): WebSocketLike {
    if (wsFactory) {
        return wsFactory(url, { headers });
    }

    const globalWebSocketCtor = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
    if (globalWebSocketCtor) {
        return new globalWebSocketCtor(url);
    }

    throw new Error(
        'No WebSocket implementation found. Provide `wsFactory` or ensure `globalThis.WebSocket` is available (e.g. browsers or Node.js 20+).'
    );
}

export function attachWebSocketListener(
    socket: WebSocketLike,
    event: WebSocketEventName,
    handler: WebSocketEventHandler
): void {
    if (typeof socket.addEventListener === 'function') {
        socket.addEventListener(event, handler);
        return;
    }

    if (typeof socket.on === 'function') {
        socket.on(event, handler);
        return;
    }

    socket[`on${event}`] = handler;
}

export function extractWebSocketMessageText(event: unknown): string | null {
    if (typeof event === 'string') return event;

    const candidate = (event as { data?: unknown })?.data ?? event;
    if (typeof candidate === 'string') return candidate;

    if (candidate && typeof (candidate as { toString: () => string }).toString === 'function') {
        return (candidate as { toString: () => string }).toString();
    }

    return null;
}

export function normalizeWebSocketCloseEvent(event: unknown): { code?: number; reason?: string } | undefined {
    if (!isRecord(event)) return undefined;

    const code = normalizeOptionalNumber(event.code);
    const reason = typeof event.reason === 'string' ? event.reason : undefined;

    return {
        ...(code !== undefined ? { code } : {}),
        ...(reason !== undefined ? { reason } : {}),
    };
}
