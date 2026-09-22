import {
    attachWebSocketListener,
    buildWebSocketHeaders,
    extractWebSocketMessageText,
    normalizeWebSocketCloseEvent,
    type WebSocketEventHandler,
    type WebSocketLike,
} from '../apis/websocket/transport';

describe('websocket transport helpers', () => {
    test('builds default browser-like headers with origin derived from websocket url', () => {
        expect(buildWebSocketHeaders('wss://mainnet-api.monday.trade/v4/public/ws')).toMatchObject({
            Origin: 'https://mainnet-api.monday.trade',
        });

        expect(buildWebSocketHeaders('ws://localhost:8080/ws', { 'X-Test': '1' })).toMatchObject({
            Origin: 'http://localhost:8080',
            'X-Test': '1',
        });
    });

    test('extracts websocket message text from string, event data, and string-like payloads', () => {
        expect(extractWebSocketMessageText('raw')).toBe('raw');
        expect(extractWebSocketMessageText({ data: 'from-event' })).toBe('from-event');
        expect(extractWebSocketMessageText({ toString: () => 'from-buffer' })).toBe('from-buffer');
        expect(extractWebSocketMessageText({ data: 1 })).toBe('1');
    });

    test('normalizes close event code and reason', () => {
        expect(normalizeWebSocketCloseEvent({ code: '1000', reason: 'done' })).toEqual({
            code: 1000,
            reason: 'done',
        });
        expect(normalizeWebSocketCloseEvent(undefined)).toBeUndefined();
    });

    test('attaches fallback on-event listener when socket has no listener API', () => {
        const socket: WebSocketLike = {
            readyState: 0,
            send: () => undefined,
            close: () => undefined,
        };
        const handler: WebSocketEventHandler = jest.fn();

        attachWebSocketListener(socket, 'message', handler);
        socket.onmessage?.('payload');

        expect(handler).toHaveBeenCalledWith('payload');
    });
});
