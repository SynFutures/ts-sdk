import {
    PublicWebsocketClient,
    type BlockNumChangedData,
    type InvalidStreamDataEvent,
    type MarketListChangedData,
} from '../../apis/websocket';
import { createFakeWebSocketFactory, type FakeWebSocket } from '../helpers/fakeWebSocket';

describe('PublicWebsocketClient common subscription', () => {
    it('normalizes marketListChanged array data for common subscribers', () => {
        const sockets: FakeWebSocket[] = [];
        const commonHandler = jest.fn<void, [MarketListChangedData]>();
        const rawHandler = jest.fn<void, [Record<string, unknown>]>();

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: createFakeWebSocketFactory(sockets),
        });

        client.subscribeCommon({ chainId: 143, type: 'common' }, (payload) => {
            if ('data' in payload) {
                commonHandler(payload);
            }
        });

        client.subscribeRaw({ chainId: 143, type: 'common' }, (payload) => rawHandler(payload), 'marketListChanged');

        expect(sockets).toHaveLength(1);
        const socket = sockets[0];
        socket.open();

        socket.message(
            JSON.stringify({
                stream: 'marketListChanged',
                data: [{ instrumentAddr: '0x73ada1ea346cc3908f41cf67a040f0acd7808be0', expiry: 4294967295 }],
            })
        );

        expect(commonHandler).toHaveBeenCalledTimes(1);
        expect(commonHandler.mock.calls[0][0]).toEqual({
            chainId: 143,
            data: [{ instrumentAddr: '0x73ada1ea346cc3908f41cf67a040f0acd7808be0', expiry: 4294967295 }],
        });

        expect(rawHandler).toHaveBeenCalledTimes(1);
        expect(rawHandler.mock.calls[0][0]).toEqual({
            data: [{ instrumentAddr: '0x73ada1ea346cc3908f41cf67a040f0acd7808be0', expiry: 4294967295 }],
        });

        client.close();
    });

    it('normalizes blockNumChanged numeric fields for common subscribers', () => {
        const sockets: FakeWebSocket[] = [];
        const commonHandler = jest.fn<void, [BlockNumChangedData]>();

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: createFakeWebSocketFactory(sockets),
        });

        client.subscribeCommon({ chainId: 143, type: 'common' }, (payload) => {
            if ('blockNum' in payload) {
                commonHandler(payload);
            }
        });

        expect(sockets).toHaveLength(1);
        const socket = sockets[0];
        socket.open();

        socket.message(
            JSON.stringify({
                stream: 'blockNumChanged',
                data: { chainId: '143', blockNum: '123456', blockTime: '1710000000' },
            })
        );

        expect(commonHandler).toHaveBeenCalledTimes(1);
        expect(commonHandler.mock.calls[0][0]).toEqual({
            chainId: 143,
            blockNum: 123456,
            blockTime: 1710000000,
        });

        client.close();
    });

    it('reports marketListChanged payloads with invalid items', () => {
        const sockets: FakeWebSocket[] = [];
        const commonHandler = jest.fn<void, [MarketListChangedData]>();
        const rawHandler = jest.fn<void, [Record<string, unknown>]>();
        const invalid = jest.fn<void, [InvalidStreamDataEvent]>();

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            onInvalidStreamData: invalid,
            wsFactory: createFakeWebSocketFactory(sockets),
        });

        client.subscribeCommon({ chainId: 143, type: 'common' }, (payload) => {
            if ('data' in payload) {
                commonHandler(payload);
            }
        });
        client.subscribeRaw({ chainId: 143, type: 'common' }, (payload) => rawHandler(payload), 'marketListChanged');

        expect(sockets).toHaveLength(1);
        const socket = sockets[0];
        socket.open();

        socket.message(
            JSON.stringify({
                stream: 'marketListChanged',
                data: [{ instrumentAddr: '0x73ada1ea346cc3908f41cf67a040f0acd7808be0', expiry: 4294967295 }, 'bad'],
            })
        );

        expect(commonHandler).not.toHaveBeenCalled();
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(invalid.mock.calls[0][0].stream).toBe('marketListChanged');
        expect(rawHandler).toHaveBeenCalledTimes(1);

        client.close();
    });
});
