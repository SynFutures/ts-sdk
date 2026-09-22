import type { Address } from 'viem';
import {
    mergeStreamMetadata,
    normalizeCommonStreamData,
    normalizeInstrumentStreamData,
    normalizeKlineStreamData,
    normalizeOrderBookStream,
    normalizePortfolioStreamData,
    normalizeStreamPayload,
    normalizeTradesStreamData,
} from '../../apis/websocket/normalizers';

describe('WebSocket stream normalizers', () => {
    it('classifies stream payload shape before field-level normalization', () => {
        expect(normalizeStreamPayload({ data: { depth: 10 } })).toEqual({
            kind: 'record',
            data: { depth: 10 },
        });
        expect(normalizeStreamPayload({ data: [1, 2, 3] })).toEqual({
            kind: 'array',
            data: [1, 2, 3],
        });
        expect(normalizeStreamPayload({ data: null })).toEqual({
            kind: 'empty',
            data: undefined,
        });
    });

    it('merges wrapper metadata into object stream payloads', () => {
        expect(
            mergeStreamMetadata({
                chainId: 143,
                instrument: '0xAbCdEf000000000000000000000000000000000000' as Address,
                expiry: 123,
                data: {
                    depth: 10,
                },
            })
        ).toEqual({
            chainId: 143,
            instrument: '0xAbCdEf000000000000000000000000000000000000',
            expiry: 123,
            depth: 10,
        });
    });

    it('normalizes blockNumChanged numeric fields', () => {
        expect(
            normalizeCommonStreamData(
                {
                    chainId: '143',
                    blockNum: '123456',
                    blockTime: '1710000000',
                },
                'blockNumChanged',
                { chainId: 1, type: 'common' }
            )
        ).toEqual({
            chainId: 143,
            blockNum: 123456,
            blockTime: 1710000000,
        });
    });

    it('validates portfolio stream payload schema', () => {
        expect(
            normalizePortfolioStreamData({
                chainId: '143',
                userAddress: '0xAbCdEf000000000000000000000000000000000000',
                type: 'order',
                orderInfo: {
                    oid: '1',
                },
            })
        ).toEqual({
            chainId: 143,
            userAddress: '0xAbCdEf000000000000000000000000000000000000',
            type: 'order',
            orderInfo: {
                oid: '1',
            },
        });
        expect(normalizePortfolioStreamData({ userAddress: '0xabc', type: 'unknown' })).toBeNull();
    });

    it('validates kline and instrument stream payload schemas', () => {
        expect(
            normalizeKlineStreamData({
                chainId: '143',
                instrument: '0xAbCdEf000000000000000000000000000000000000',
                expiry: '4294967295',
                interval: '1m',
                open: '1',
                close: '2',
            })
        ).toMatchObject({
            chainId: 143,
            instrument: '0xAbCdEf000000000000000000000000000000000000',
            expiry: 4294967295,
            interval: '1m',
            open: 1,
            close: 2,
        });
        expect(normalizeKlineStreamData({ chainId: 143, instrument: '0xabc', expiry: 1 })).toBeNull();

        expect(
            normalizeInstrumentStreamData({
                chainId: '143',
                instrument: '0xAbCdEf000000000000000000000000000000000000',
                expiry: '4294967295',
                symbol: 'TEST',
                markPrice: '1',
            })
        ).toEqual({
            chainId: 143,
            instrument: '0xAbCdEf000000000000000000000000000000000000',
            expiry: 4294967295,
            symbol: 'TEST',
            markPrice: '1',
        });
        expect(normalizeInstrumentStreamData({ chainId: 143, expiry: 1 })).toBeNull();
    });

    it('rejects present numeric fields that cannot be normalized', () => {
        expect(
            normalizeKlineStreamData({
                chainId: 143,
                instrument: '0xAbCdEf000000000000000000000000000000000000',
                expiry: 1,
                interval: '1m',
                open: 'not-a-number',
            })
        ).toBeNull();
    });

    it('does not leak unvalidated fields into typed payloads', () => {
        expect(
            normalizeInstrumentStreamData({
                chainId: 143,
                instrument: '0xAbCdEf000000000000000000000000000000000000',
                expiry: 1,
                symbol: 'BTC/USDC',
                untrusted: { nested: true },
            })
        ).toEqual({
            chainId: 143,
            instrument: '0xAbCdEf000000000000000000000000000000000000',
            expiry: 1,
            symbol: 'BTC/USDC',
        });
    });

    it('rejects invalid optional portfolio fields when they are present', () => {
        expect(
            normalizePortfolioStreamData({
                chainId: 'invalid',
                userAddress: '0xAbCdEf000000000000000000000000000000000000',
                type: 'order',
            })
        ).toBeNull();
        expect(
            normalizePortfolioStreamData({
                userAddress: '0xAbCdEf000000000000000000000000000000000000',
                type: 'order',
                orderInfo: { oid: 1 },
            })
        ).toBeNull();
    });

    it('normalizes trades stream items with wrapper defaults', () => {
        const tokenInfo = {
            address: '0xToken',
            symbol: 'TKN',
            decimals: 18,
            image: '',
            price: 1,
        };

        const normalized = normalizeTradesStreamData({
            chainId: '1',
            instrument: '0xABC',
            expiry: '123',
            data: [
                {
                    id: 't1',
                    size: '1',
                    balance: '0',
                    price: '1',
                    tradeFee: '0',
                    protocolFee: '0',
                    timestamp: '10',
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
            ],
        });

        expect(normalized?.chainId).toBe(1);
        expect(normalized?.expiry).toBe(123);
        expect(normalized?.instrument).toBe('0xabc');
        expect(normalized?.data[0]).toMatchObject({
            chainId: 1,
            expiry: 123,
            instrument: '0xabc',
            instrumentAddress: '0xabc',
            timestamp: 10,
        });
    });

    it('rejects order book depths with invalid level items', () => {
        expect(
            normalizeOrderBookStream({
                chainId: 1,
                instrument: '0xAbC',
                expiry: 123,
                '1': {
                    bids: [
                        {
                            tick: 1,
                            price: '1',
                            baseSize: '1',
                            quoteSize: '1',
                            baseSum: '1',
                            quoteSum: '1',
                        },
                    ],
                    asks: ['bad'],
                },
            })
        ).toBeNull();
    });
});
