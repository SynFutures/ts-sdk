import { PublicWebsocketClient, type PublicWsRequestResultEvent, type TradesStreamData } from '../../apis/websocket';
import { createFakeWebSocketFactory, FakeWebSocket, parseWsRequest } from '../helpers/fakeWebSocket';

const INSTRUMENT = '0xAbC0000000000000000000000000000000000000';
const OTHER_INSTRUMENT = '0xDeF0000000000000000000000000000000000000';
const TRADER = '0xF194000000000000000000000000000000008957';
const PAIR = `${INSTRUMENT.toLowerCase()}_123`;

const tokenInfo = { address: '0xToken', symbol: 'TKN', decimals: 18, image: '', price: 1 };

/** A trade item in the shape the mainnet public WebSocket sends. */
function tradeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 't1',
        instrumentAddress: INSTRUMENT,
        expiry: 123,
        chainId: 1,
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
        trader: TRADER,
        fairPrice: '1',
        markPrice: '1',
        ...overrides,
    };
}

function tradesMessage(data: unknown, wrapper: Record<string, unknown> = {}): string {
    return JSON.stringify({ stream: 'trades', chainId: 1, instrument: INSTRUMENT, expiry: 123, data, ...wrapper });
}

function connect(onInvalidStreamData?: (event: { stream: string; error: unknown }) => void) {
    const sockets: FakeWebSocket[] = [];
    const client = new PublicWebsocketClient({
        url: 'ws://localhost',
        pingIntervalMs: 0,
        autoReconnect: false,
        onInvalidStreamData,
        wsFactory: createFakeWebSocketFactory(sockets),
    });
    const handler = jest.fn<void, [TradesStreamData]>();
    client.subscribeTrades({ chainId: 1, pairs: [PAIR], type: 'trades' }, (data) => handler(data));
    const socket = sockets[0];
    socket.open();
    return { client, socket, handler };
}

describe('PublicWebsocketClient trades subscription', () => {
    it('rejects trades subscriptions with empty pairs', () => {
        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: () => new FakeWebSocket(),
        });

        expect(() => client.subscribeTrades({ chainId: 1, pairs: [], type: 'trades' }, () => undefined)).toThrow(
            'Trades subscription requires a non-empty `pairs` array.'
        );

        client.close();
    });

    it('reports SUBSCRIBE/UNSUBSCRIBE ACKs via onRequestResult', () => {
        const sockets: FakeWebSocket[] = [];
        const requestResults: PublicWsRequestResultEvent[] = [];

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            onRequestResult: (event) => requestResults.push(event),
            wsFactory: createFakeWebSocketFactory(sockets),
        });

        const subscription = client.subscribeTrades(
            { chainId: 1, pairs: ['0xabc_123'], type: 'trades' },
            () => undefined
        );

        const socket = sockets[0];
        socket.open();

        const subscribePayload = JSON.parse(socket.sent[0]) as { id: number };
        socket.message(JSON.stringify({ id: subscribePayload.id, result: 'success' }));

        expect(requestResults).toHaveLength(1);
        expect(requestResults[0]).toMatchObject({
            id: subscribePayload.id,
            method: 'SUBSCRIBE',
            result: 'success',
            ok: true,
            params: { chainId: 1, pairs: ['0xabc_123'], type: 'trades' },
        });

        subscription.unsubscribe();
        const unsubscribePayload = JSON.parse(socket.sent[1]) as { id: number };
        socket.message(JSON.stringify({ id: unsubscribePayload.id, result: 'success' }));

        expect(requestResults).toHaveLength(2);
        expect(requestResults[1]).toMatchObject({
            id: unsubscribePayload.id,
            method: 'UNSUBSCRIBE',
            result: 'success',
            ok: true,
            params: { chainId: 1, pairs: ['0xabc_123'], type: 'trades' },
        });

        client.close();
    });

    it('retries topics whose SUBSCRIBE the server rejected', () => {
        const sockets: FakeWebSocket[] = [];
        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: createFakeWebSocketFactory(sockets),
        });
        const params = { chainId: 1, pairs: ['0xabc_123'], type: 'trades' as const };

        client.subscribeTrades(params, () => undefined);
        const socket = sockets[0];
        socket.open();
        const rejected = JSON.parse(socket.sent[0]) as { id: number };
        socket.message(JSON.stringify({ id: rejected.id, result: 'invalid params' }));

        client.subscribeTrades(params, () => undefined);
        expect(socket.sent).toHaveLength(2);
        expect(parseWsRequest(socket.sent[1])).toEqual({ method: 'SUBSCRIBE', params });

        client.close();
    });

    it('sends SUBSCRIBE/UNSUBSCRIBE without internal fields', () => {
        const sockets: FakeWebSocket[] = [];
        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: createFakeWebSocketFactory(sockets),
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

    it('decodes trades and filters by chainId/pair', () => {
        const { client, socket, handler } = connect();

        socket.message(tradesMessage([tradeItem({ expiry: '123', chainId: '1', untrustedTradeField: true })]));

        expect(handler).toHaveBeenCalledTimes(1);
        const delivered = handler.mock.calls[0][0];
        expect(delivered).toMatchObject({ chainId: 1, instrument: INSTRUMENT.toLowerCase(), expiry: 123 });
        expect(delivered.data).toEqual([
            {
                id: 't1',
                chainId: 1,
                instrumentAddress: INSTRUMENT.toLowerCase(),
                expiry: 123,
                trader: TRADER,
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
            },
        ]);

        socket.message(tradesMessage([tradeItem({ chainId: 2 })], { chainId: 2 }));
        socket.message(
            tradesMessage([tradeItem({ instrumentAddress: OTHER_INSTRUMENT })], { instrument: OTHER_INSTRUMENT })
        );
        expect(handler).toHaveBeenCalledTimes(1);

        client.close();
    });

    it('delivers batch trades as a single payload', () => {
        const { client, socket, handler } = connect();

        socket.message(tradesMessage([tradeItem({ id: 't-1' }), tradeItem({ id: 't-2', txHash: '0xTX2' })]));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].data.map((trade) => trade.id)).toEqual(['t-1', 't-2']);

        client.close();
    });

    it('delivers trades whose trader the server sends empty', () => {
        // The Base public WebSocket sends `trader: ""` for some items in a batch.
        const { client, socket, handler } = connect();

        socket.message(tradesMessage([tradeItem({ id: 't-1', trader: '' }), tradeItem({ id: 't-2' })]));

        expect(handler).toHaveBeenCalledTimes(1);
        const [first, second] = handler.mock.calls[0][0].data;
        expect(first).not.toHaveProperty('trader');
        expect(second?.trader).toBe(TRADER);

        client.close();
    });

    it('rejects the whole batch when any trade item is malformed', () => {
        const invalid = jest.fn<void, [{ stream: string; error: unknown }]>();
        const { client, socket, handler } = connect(invalid);

        socket.message(
            tradesMessage([tradeItem(), { id: 't-invalid', instrumentAddress: INSTRUMENT, chainId: 1, expiry: 123 }])
        );

        expect(handler).not.toHaveBeenCalled();
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(invalid.mock.calls[0][0]).toMatchObject({
            stream: 'trades',
            error: new Error('Invalid trades.data[1].trader: expected string'),
        });

        client.close();
    });

    it('rejects trade items that do not belong to the message pair', () => {
        const invalid = jest.fn<void, [{ stream: string; error: unknown }]>();
        const { client, socket, handler } = connect(invalid);

        socket.message(tradesMessage([tradeItem(), tradeItem({ instrumentAddress: OTHER_INSTRUMENT })]));
        socket.message(tradesMessage([tradeItem({ expiry: 456 })]));
        socket.message(tradesMessage([tradeItem({ chainId: undefined })]));

        expect(handler).not.toHaveBeenCalled();
        expect(invalid.mock.calls.map(([event]) => event.error)).toEqual([
            new Error('Invalid trades.data[1]: trade does not belong to the message chain and pair'),
            new Error('Invalid trades.data[0]: trade does not belong to the message chain and pair'),
            new Error('Invalid trades.data[0].chainId: expected number'),
        ]);

        client.close();
    });

    it('reports invalid trades payloads when data is not an array', () => {
        const invalid = jest.fn<void, [{ stream: string; error: unknown }]>();
        const { client, socket, handler } = connect(invalid);

        socket.message(tradesMessage({}));

        expect(handler).not.toHaveBeenCalled();
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(invalid.mock.calls[0][0]).toMatchObject({
            stream: 'trades',
            error: new Error('Invalid trades.data: expected array'),
        });

        client.close();
    });
});
