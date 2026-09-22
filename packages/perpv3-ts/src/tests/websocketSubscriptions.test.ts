import type { Address } from 'viem';
import { PublicWsSubscriptionRegistry } from '../apis/websocket/subscriptions';

describe('WebSocket subscription registry', () => {
    it('allocates subscription ids and removes records by stream bucket', () => {
        const registry = new PublicWsSubscriptionRegistry();
        const params = {
            chainId: 1,
            instrument: '0xabc0000000000000000000000000000000000000' as Address,
            expiry: 123,
            type: 'orderBook' as const,
        };
        const handler = jest.fn();

        const record = registry.addOrderBook(params, handler);

        expect(record.id).toBe(1);
        expect([...registry.orderBooks()]).toEqual([record]);
        expect(registry.removeOrderBook(record.id)).toBe(record);
        expect([...registry.orderBooks()]).toEqual([]);
    });

    it('normalizes trades pair index once when adding a subscription', () => {
        const registry = new PublicWsSubscriptionRegistry();
        const record = registry.addTrades({ chainId: 1, pairs: ['0xABC_123'], type: 'trades' }, jest.fn());

        expect(record.id).toBe(1);
        expect(record.pairSet.has('0xabc_123')).toBe(true);
    });
});
