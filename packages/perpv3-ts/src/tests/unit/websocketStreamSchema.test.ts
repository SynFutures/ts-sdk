import type { Address } from 'viem';
import {
    PublicWebsocketClient,
    type BlockNumChangedData,
    type InvalidStreamDataEvent,
    type KlineStreamData,
} from '../../apis/websocket';
import { createFakeWebSocketFactory, type FakeWebSocket } from '../helpers/fakeWebSocket';

describe('PublicWebsocketClient stream schema validation', () => {
    it('drops invalid kline payloads before typed subscriber dispatch', () => {
        const sockets: FakeWebSocket[] = [];
        const handler = jest.fn<void, [KlineStreamData]>();
        const invalid = jest.fn<void, [InvalidStreamDataEvent]>();
        const instrument = '0xAbCdEf0000000000000000000000000000000000' as Address;

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            onInvalidStreamData: invalid,
            wsFactory: createFakeWebSocketFactory(sockets),
        });

        client.subscribeKline({ chainId: 143, instrument, expiry: 4294967295, interval: '1m', type: 'kline' }, (data) =>
            handler(data)
        );

        expect(sockets).toHaveLength(1);
        const socket = sockets[0];
        socket.open();

        socket.message(
            JSON.stringify({
                stream: 'kline',
                data: {
                    chainId: 143,
                    instrument,
                    expiry: 4294967295,
                },
            })
        );

        expect(handler).not.toHaveBeenCalled();
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(invalid.mock.calls[0][0].stream).toBe('kline');

        client.close();
    });

    it('reports invalid common stream payloads before typed subscriber dispatch', () => {
        const sockets: FakeWebSocket[] = [];
        const handler = jest.fn<void, [BlockNumChangedData]>();
        const raw = jest.fn<void, [Record<string, unknown>]>();
        const invalid = jest.fn<void, [InvalidStreamDataEvent]>();

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            onInvalidStreamData: invalid,
            wsFactory: createFakeWebSocketFactory(sockets),
        });

        client.subscribeCommon({ chainId: 143, type: 'common' }, (data) => {
            if ('blockNum' in data) {
                handler(data);
            }
        });
        client.subscribeRaw({ chainId: 143, type: 'common' }, (data) => raw(data), 'blockNumChanged');

        expect(sockets).toHaveLength(1);
        const socket = sockets[0];
        socket.open();

        socket.message(
            JSON.stringify({
                stream: 'blockNumChanged',
                data: { chainId: 143, blockTime: '1710000000' },
            })
        );

        expect(handler).not.toHaveBeenCalled();
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(invalid.mock.calls[0][0].stream).toBe('blockNumChanged');
        expect(raw).toHaveBeenCalledTimes(1);

        client.close();
    });

    it('keeps malformed kline payloads on raw subscriptions only', () => {
        const sockets: FakeWebSocket[] = [];
        const handler = jest.fn<void, [KlineStreamData]>();
        const raw = jest.fn<void, [Record<string, unknown>]>();
        const invalid = jest.fn<void, [InvalidStreamDataEvent]>();
        const instrument = '0xAbCdEf0000000000000000000000000000000000' as Address;

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            onInvalidStreamData: invalid,
            wsFactory: createFakeWebSocketFactory(sockets),
        });
        const params = { chainId: 143, instrument, expiry: 4294967295, interval: '1m', type: 'kline' } as const;

        client.subscribeKline(params, (data) => handler(data));
        client.subscribeRaw(params, (data) => raw(data), 'kline');

        const socket = sockets[0];
        socket.open();
        socket.message(
            JSON.stringify({
                stream: 'kline',
                data: {
                    chainId: 143,
                    instrument,
                    expiry: 4294967295,
                    interval: '1m',
                    open: 'not-a-number',
                },
            })
        );

        expect(handler).not.toHaveBeenCalled();
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(invalid.mock.calls[0][0].error).toEqual(new Error('Invalid open: expected number'));
        expect(raw).toHaveBeenCalledTimes(1);

        client.close();
    });
});
