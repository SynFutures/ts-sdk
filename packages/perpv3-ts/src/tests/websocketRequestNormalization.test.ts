import { PublicWebsocketClient } from '../apis/websocket';
import type { Address } from 'viem';
import { createFakeWebSocketFactory, parseWsRequest, type FakeWebSocket } from './helpers/fakeWebSocket';

describe('PublicWebsocketClient request normalization', () => {
    it('lowercases instrument/userAddress/pairs in outgoing requests', () => {
        const sockets: FakeWebSocket[] = [];

        const mixedCaseInstrument = '0xAbCdEf000000000000000000000000000000000000' as Address;
        const mixedCaseUserAddress = '0xB0B81c2c7686c63acAE28F9778ca8Fa80f0C004b' as Address;

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: createFakeWebSocketFactory(sockets),
        });

        const orderBookSub = client.subscribeOrderBook(
            { chainId: 1, instrument: mixedCaseInstrument, expiry: 123, type: 'orderBook' },
            () => undefined
        );
        const portfolioSub = client.subscribePortfolio(
            { chainId: 1, userAddress: mixedCaseUserAddress, type: 'portfolio' },
            () => undefined
        );
        const tradesSub = client.subscribeTrades(
            { chainId: 1, pairs: [`${mixedCaseInstrument}_123`], type: 'trades' },
            () => undefined
        );

        expect(sockets).toHaveLength(1);
        const socket = sockets[0];

        socket.open();

        expect(socket.sent).toHaveLength(3);
        expect(parseWsRequest(socket.sent[0])).toEqual({
            method: 'SUBSCRIBE',
            params: { chainId: 1, instrument: mixedCaseInstrument.toLowerCase(), expiry: 123, type: 'orderBook' },
        });
        expect(parseWsRequest(socket.sent[1])).toEqual({
            method: 'SUBSCRIBE',
            params: { chainId: 1, userAddress: mixedCaseUserAddress.toLowerCase(), type: 'portfolio' },
        });
        expect(parseWsRequest(socket.sent[2])).toEqual({
            method: 'SUBSCRIBE',
            params: { chainId: 1, pairs: [`${mixedCaseInstrument.toLowerCase()}_123`], type: 'trades' },
        });

        orderBookSub.unsubscribe();
        portfolioSub.unsubscribe();
        tradesSub.unsubscribe();

        expect(socket.sent).toHaveLength(6);
        expect(parseWsRequest(socket.sent[3])).toEqual({
            method: 'UNSUBSCRIBE',
            params: { chainId: 1, instrument: mixedCaseInstrument.toLowerCase(), expiry: 123, type: 'orderBook' },
        });
        expect(parseWsRequest(socket.sent[4])).toEqual({
            method: 'UNSUBSCRIBE',
            params: { chainId: 1, userAddress: mixedCaseUserAddress.toLowerCase(), type: 'portfolio' },
        });
        expect(parseWsRequest(socket.sent[5])).toEqual({
            method: 'UNSUBSCRIBE',
            params: { chainId: 1, pairs: [`${mixedCaseInstrument.toLowerCase()}_123`], type: 'trades' },
        });

        client.close();
    });
});
