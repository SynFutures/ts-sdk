import { PublicWebsocketClient } from '../../apis/websocket';
import { FakeWebSocket, createFakeWebSocketFactory, parseWsRequest } from '../helpers/fakeWebSocket';

test('retains a topic until both typed and raw subscribers leave', () => {
    const sockets: FakeWebSocket[] = [];
    const client = new PublicWebsocketClient({
        wsFactory: createFakeWebSocketFactory(sockets),
        autoReconnect: false,
        pingIntervalMs: 0,
    });
    const typed = client.subscribeCommon({ chainId: 1, type: 'common' }, () => undefined);
    sockets[0].open();
    const rawHandler = jest.fn();
    const raw = client.subscribeRaw({ type: 'common', params: { chainId: 1 } }, rawHandler, 'marketListChanged');
    expect(sockets[0].sent).toHaveLength(1);
    typed.unsubscribe();
    expect(sockets[0].sent).toHaveLength(1);
    sockets[0].message(JSON.stringify({ stream: 'marketListChanged', chainId: 1, data: [] }));
    expect(rawHandler).toHaveBeenCalledTimes(1);
    raw.unsubscribe();
    raw.unsubscribe();
    expect(sockets[0].sent.map(parseWsRequest).map((r) => r.method)).toEqual(['SUBSCRIBE', 'UNSUBSCRIBE']);
    client.close();
});

test('retains overlapping pairs and restores only remaining subscriptions on reconnect', () => {
    const sockets: FakeWebSocket[] = [];
    const client = new PublicWebsocketClient({
        wsFactory: createFakeWebSocketFactory(sockets),
        autoReconnect: false,
        pingIntervalMs: 0,
    });
    const a = client.subscribeTrades({ chainId: 1, type: 'trades', pairs: ['A', 'B'] }, () => undefined);
    sockets[0].open();
    const b = client.subscribeTrades({ chainId: 1, type: 'trades', pairs: ['b', 'C'] }, () => undefined);
    expect(parseWsRequest(sockets[0].sent[1]).params.pairs).toEqual(['c']);
    a.unsubscribe();
    expect(parseWsRequest(sockets[0].sent[2])).toMatchObject({ method: 'UNSUBSCRIBE', params: { pairs: ['a'] } });
    client.close();
    client.connect();
    sockets[1].open();
    expect(sockets[1].sent.map(parseWsRequest)).toEqual([
        { method: 'SUBSCRIBE', params: { chainId: 1, type: 'trades', pairs: ['b', 'c'] } },
    ]);
    b.unsubscribe();
    client.close();
});

test('ignores all delayed events from an obsolete connection', () => {
    class DelayedCloseSocket extends FakeWebSocket {
        close() {
            this.readyState = 3;
        }
    }
    const sockets: DelayedCloseSocket[] = [];
    const onMessage = jest.fn();
    const onError = jest.fn();
    const client = new PublicWebsocketClient({
        wsFactory: () => {
            const s = new DelayedCloseSocket();
            sockets.push(s);
            return s;
        },
        autoReconnect: false,
        pingIntervalMs: 0,
        onMessage,
        onError,
    });
    client.connect();
    sockets[0].open();
    client.close();
    client.connect();
    sockets[1].open();
    sockets[0].emit('close', {});
    sockets[0].emit('open');
    sockets[0].emit('error', new Error('old socket'));
    sockets[0].message(JSON.stringify({ id: 1, result: 'success' }));
    const sub = client.subscribeCommon({ chainId: 1, type: 'common' }, () => undefined);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].sent).toHaveLength(1);
    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    sub.unsubscribe();
    client.close();
});

test('manual close notifies once while delayed socket events remain obsolete', () => {
    const sockets: FakeWebSocket[] = [];
    const onDisconnect = jest.fn();
    const client = new PublicWebsocketClient({
        wsFactory: createFakeWebSocketFactory(sockets),
        onDisconnect,
        pingIntervalMs: 0,
    });
    client.connect();
    sockets[0].open();
    client.close();
    client.close();
    sockets[0].emit('close', { code: 1000 });
    expect(onDisconnect).toHaveBeenCalledTimes(1);
});
