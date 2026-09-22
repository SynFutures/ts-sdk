import type { Address } from 'viem';
import {
    buildPublicWsRequest,
    buildWsRequestParams,
    buildWsRequestResultEvent,
    isPublicWsAckMessage,
    isPublicWsStreamMessage,
} from '../apis/websocket/protocol';

describe('WebSocket protocol helpers', () => {
    it('normalizes outgoing request params without mutating subscribe params', () => {
        const instrument = '0xAbCdEf000000000000000000000000000000000000' as Address;
        const userAddress = '0xB0B81c2c7686c63acAE28F9778ca8Fa80f0C004b' as Address;
        const params = {
            type: 'custom',
            chainId: 1,
            instrument,
            userAddress,
            pairs: [`${instrument}_123`, 7, null],
            params: {
                depth: 10,
            },
        };

        expect(buildWsRequestParams(params)).toEqual({
            type: 'custom',
            chainId: 1,
            instrument: instrument.toLowerCase(),
            userAddress: userAddress.toLowerCase(),
            pairs: [`${instrument.toLowerCase()}_123`],
            depth: 10,
        });
        expect(params.instrument).toBe(instrument);
        expect(params.userAddress).toBe(userAddress);
    });

    it('builds normalized public WS request envelopes', () => {
        const instrument = '0xAbCdEf000000000000000000000000000000000000' as Address;

        expect(
            buildPublicWsRequest(7, 'SUBSCRIBE', {
                type: 'orderBook',
                chainId: 1,
                instrument,
                expiry: 123,
            })
        ).toEqual({
            id: 7,
            method: 'SUBSCRIBE',
            params: {
                type: 'orderBook',
                chainId: 1,
                instrument: instrument.toLowerCase(),
                expiry: 123,
            },
        });
    });

    it('identifies ACK and stream messages by wire shape', () => {
        expect(isPublicWsAckMessage({ id: 1, result: 'success' })).toBe(true);
        expect(isPublicWsAckMessage({ id: '1', result: 'success' })).toBe(false);
        expect(isPublicWsStreamMessage({ stream: 'orderBook', data: {} })).toBe(true);
        expect(isPublicWsStreamMessage({ stream: 1, data: {} })).toBe(false);
    });

    it('builds request result events with latency when a pending request is known', () => {
        expect(
            buildWsRequestResultEvent(
                { id: 3, result: 'successfully subscribed' },
                { method: 'SUBSCRIBE', params: { type: 'orderBook' }, sentAtMs: 100 },
                145
            )
        ).toEqual({
            id: 3,
            method: 'SUBSCRIBE',
            params: { type: 'orderBook' },
            result: 'successfully subscribed',
            ok: true,
            sentAtMs: 100,
            receivedAtMs: 145,
            latencyMs: 45,
        });
    });
});
