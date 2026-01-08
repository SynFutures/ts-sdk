import { PublicWebsocketClient, type TradesStreamData } from '../apis/websocket';

type EventHandler = (...args: unknown[]) => void;

class FakeWebSocket {
    readyState = 0;
    readonly sent: string[] = [];

    private readonly listeners = new Map<string, EventHandler[]>();

    addEventListener(event: string, handler: EventHandler): void {
        const existing = this.listeners.get(event) ?? [];
        existing.push(handler);
        this.listeners.set(event, existing);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = 3;
        this.emit('close', {});
    }

    open(): void {
        this.readyState = 1;
        this.emit('open');
    }

    message(data: string): void {
        this.emit('message', { data });
    }

    private emit(event: string, payload?: unknown): void {
        for (const handler of this.listeners.get(event) ?? []) {
            handler(payload);
        }
    }
}

function parseWsRequest(payload: string): { method: string; params: Record<string, unknown> } {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid WS request payload');

    const method = (parsed as { method?: unknown }).method;
    const params = (parsed as { params?: unknown }).params;
    if (typeof method !== 'string' || !params || typeof params !== 'object') {
        throw new Error('Invalid WS request payload shape');
    }

    return { method, params: params as Record<string, unknown> };
}

describe('PublicWebsocketClient trades subscription', () => {
    it('sends SUBSCRIBE/UNSUBSCRIBE without internal fields', () => {
        const sockets: FakeWebSocket[] = [];
        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: () => {
                const socket = new FakeWebSocket();
                sockets.push(socket);
                return socket;
            },
        });

        const subscription = client.subscribeTrades(
            { chainId: 1, pairs: ['0xabc_123'], type: 'trades' },
            () => undefined
        );

        expect(sockets).toHaveLength(1);
        const socket = sockets[0];

        socket.open();
        expect(socket.sent).toHaveLength(1);
        expect(parseWsRequest(socket.sent[0])).toEqual({
            method: 'SUBSCRIBE',
            params: { chainId: 1, pairs: ['0xabc_123'], type: 'trades' },
        });

        subscription.unsubscribe();
        expect(socket.sent).toHaveLength(2);
        expect(parseWsRequest(socket.sent[1])).toEqual({
            method: 'UNSUBSCRIBE',
            params: { chainId: 1, pairs: ['0xabc_123'], type: 'trades' },
        });

        client.close();
    });

    it('normalizes trades data and filters by chainId/pair', () => {
        const sockets: FakeWebSocket[] = [];
        const handler = jest.fn<void, [TradesStreamData]>();

        const tokenInfo = {
            address: '0xToken',
            symbol: 'TKN',
            decimals: 18,
            image: '',
            price: 1,
        };

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: () => {
                const socket = new FakeWebSocket();
                sockets.push(socket);
                return socket;
            },
        });

        client.subscribeTrades({ chainId: 1, pairs: ['0xabc_123'], type: 'trades' }, (data) => handler(data));
        const socket = sockets[0];
        socket.open();

        socket.message(
            JSON.stringify({
                chainId: 1,
                instrument: '0xABC',
                expiry: 123,
                stream: 'trades',
                data: [{
                    id: 't1',
                    instrument: '0xABC',
                    instrumentAddress: '0xABC',
                    expiry: '123',
                    chainId: '1',
                    size: '1',
                    balance: '0',
                    price: '1',
                    tradeFee: '0',
                    protocolFee: '0',
                    timestamp: 1,
                    txHash: '0xTX1',
                    type: 'Market',
                    symbol: 'AAA/BBB',
                    baseToken: tokenInfo,
                    quoteToken: tokenInfo,
                    typeString: 'Market',
                    side: 'long',
                    event: 'trade',
                    markPrice: '1',
                    fairPrice: '1',
                }],
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].expiry).toBe(123);
        expect(handler.mock.calls[0][0].chainId).toBe(1);

        socket.message(
            JSON.stringify({
                chainId: 2,
                stream: 'trades',
                data: [{
                    id: 't2',
                    instrument: '0xABC',
                    instrumentAddress: '0xABC',
                    expiry: 123,
                    chainId: 2,
                    size: '1',
                    balance: '0',
                    price: '1',
                    tradeFee: '0',
                    protocolFee: '0',
                    timestamp: 1,
                    txHash: '0xTX2',
                    type: 'Market',
                    symbol: 'AAA/BBB',
                    baseToken: tokenInfo,
                    quoteToken: tokenInfo,
                    typeString: 'Market',
                    side: 'long',
                    event: 'trade',
                    markPrice: '1',
                    fairPrice: '1',
                }],
            })
        );
        expect(handler).toHaveBeenCalledTimes(1);

        socket.message(
            JSON.stringify({
                stream: 'trades',
                chainId: 2,
                instrument: '0xABC',
                expiry: 123,
                data: [{
                    id: 't3',
                    instrument: '0xDEF',
                    instrumentAddress: '0xDEF',
                    expiry: 123,
                    chainId: 1,
                    size: '1',
                    balance: '0',
                    price: '1',
                    tradeFee: '0',
                    protocolFee: '0',
                    timestamp: 1,
                    txHash: '0xTX3',
                    type: 'Market',
                    symbol: 'AAA/BBB',
                    baseToken: tokenInfo,
                    quoteToken: tokenInfo,
                    typeString: 'Market',
                    side: 'long',
                    event: 'trade',
                    markPrice: '1',
                    fairPrice: '1',
                }],
            })
        );
        expect(handler).toHaveBeenCalledTimes(1);

        client.close();
    });

    it('reports invalid trades payloads via onInvalidStreamData', () => {
        const sockets: FakeWebSocket[] = [];
        const tradesHandler = jest.fn<void, [TradesStreamData]>();
        const invalidHandler = jest.fn<void, [{ stream: string }]>();

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            onInvalidStreamData: (event) => invalidHandler({ stream: event.stream }),
            wsFactory: () => {
                const socket = new FakeWebSocket();
                sockets.push(socket);
                return socket;
            },
        });

        client.subscribeTrades({ chainId: 1, pairs: ['0xabc_123'], type: 'trades' }, (data) => tradesHandler(data));
        const socket = sockets[0];
        socket.open();

        socket.message(
            JSON.stringify({
                chainId: 1,
                instrument: '0xABC',
                expiry: 123,
                stream: 'trades',
                data: [{
                    id: 't-invalid',
                    instrumentAddress: '0xABC',
                    expiry: 123,
                    chainId: 1,
                }],
            })
        );

        expect(tradesHandler).toHaveBeenCalledTimes(0);
        expect(invalidHandler).toHaveBeenCalledTimes(1);
        expect(invalidHandler.mock.calls[0][0]).toEqual({ stream: 'trades' });

        client.close();
    });
});
