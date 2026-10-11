import type { Address } from 'viem';
import {
    mergeStreamMetadata,
    decodeCommonStreamData,
    decodeInstrumentStreamData,
    decodeKlineStreamData,
    decodeOrderBookStream,
    decodePortfolioStreamData,
    normalizeStreamPayload,
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
                instrument: '0xAbCdEf0000000000000000000000000000000000' as Address,
                expiry: 123,
                data: {
                    depth: 10,
                },
            })
        ).toEqual({
            chainId: 143,
            instrument: '0xAbCdEf0000000000000000000000000000000000',
            expiry: 123,
            depth: 10,
        });
    });

    it('normalizes blockNumChanged numeric fields', () => {
        expect(
            decodeCommonStreamData(
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
            decodePortfolioStreamData({
                chainId: '143',
                userAddress: '0xAbCdEf0000000000000000000000000000000000',
                type: 'order',
                orderInfo: {
                    oid: '1',
                },
            })
        ).toEqual({
            chainId: 143,
            userAddress: '0xAbCdEf0000000000000000000000000000000000',
            type: 'order',
            orderInfo: {
                oid: '1',
            },
        });
        expect(() =>
            decodePortfolioStreamData({ userAddress: '0xAbCdEf0000000000000000000000000000000000', type: 'unknown' })
        ).toThrow('Invalid type: unsupported portfolio stream type unknown');
    });

    it('validates kline and instrument stream payload schemas', () => {
        expect(
            decodeKlineStreamData({
                chainId: '143',
                instrument: '0xAbCdEf0000000000000000000000000000000000',
                expiry: '4294967295',
                interval: '1m',
                open: '1',
                close: '2',
            })
        ).toMatchObject({
            chainId: 143,
            instrument: '0xAbCdEf0000000000000000000000000000000000',
            expiry: 4294967295,
            interval: '1m',
            open: 1,
            close: 2,
        });
        expect(() =>
            decodeKlineStreamData({ chainId: 143, instrument: '0xAbCdEf0000000000000000000000000000000000', expiry: 1 })
        ).toThrow('Invalid interval: expected string');

        expect(
            decodeInstrumentStreamData({
                chainId: '143',
                instrument: '0xAbCdEf0000000000000000000000000000000000',
                expiry: '4294967295',
                symbol: 'TEST',
                markPrice: '1',
            })
        ).toEqual({
            chainId: 143,
            instrument: '0xAbCdEf0000000000000000000000000000000000',
            expiry: 4294967295,
            symbol: 'TEST',
            markPrice: '1',
        });
        expect(() => decodeInstrumentStreamData({ chainId: 143, expiry: 1 })).toThrow(
            'Invalid instrument: expected string'
        );
    });

    it('rejects present numeric fields that cannot be normalized', () => {
        expect(() =>
            decodeKlineStreamData({
                chainId: 143,
                instrument: '0xAbCdEf0000000000000000000000000000000000',
                expiry: 1,
                interval: '1m',
                open: 'not-a-number',
            })
        ).toThrow('Invalid open: expected number');
    });

    it('does not leak unvalidated fields into typed payloads', () => {
        expect(
            decodeInstrumentStreamData({
                chainId: 143,
                instrument: '0xAbCdEf0000000000000000000000000000000000',
                expiry: 1,
                symbol: 'BTC/USDC',
                untrusted: { nested: true },
            })
        ).toEqual({
            chainId: 143,
            instrument: '0xAbCdEf0000000000000000000000000000000000',
            expiry: 1,
            symbol: 'BTC/USDC',
        });
    });

    it('rejects instrument values that are not 20-byte addresses', () => {
        expect(() =>
            decodeInstrumentStreamData({
                chainId: 143,
                instrument: '0xAbCdEf000000000000000000000000000000000000',
                expiry: 1,
            })
        ).toThrow('Invalid instrument: expected address');
    });

    it('rejects empty numeric strings instead of reading them as zero', () => {
        expect(() =>
            decodeKlineStreamData({
                chainId: '',
                instrument: '0xAbCdEf0000000000000000000000000000000000',
                expiry: 1,
                interval: '1m',
            })
        ).toThrow('Invalid chainId: expected number');
    });

    it('rejects invalid optional portfolio fields when they are present', () => {
        expect(() =>
            decodePortfolioStreamData({
                chainId: 'invalid',
                userAddress: '0xAbCdEf0000000000000000000000000000000000',
                type: 'order',
            })
        ).toThrow('Invalid chainId: expected number');
        expect(() =>
            decodePortfolioStreamData({
                userAddress: '0xAbCdEf0000000000000000000000000000000000',
                type: 'order',
                orderInfo: { oid: 1 },
            })
        ).toThrow('Invalid orderInfo.oid: expected string');
    });

    it('decodes null order book sides from the server as empty levels', () => {
        // Shape captured from the mainnet public WebSocket: unpopulated ratios carry `null` sides.
        const blockInfo = { height: 73479712, timestamp: 1778338580 };
        const level = {
            tick: 75819,
            price: '1961610169998866376860',
            baseSize: '3072202670522331156',
            quoteSize: '6026464002794281287679',
            baseSum: '3072202670522331156',
            quoteSum: '6026464002794281287679',
        };
        const merged = mergeStreamMetadata({
            chainId: 143,
            instrument: '0x44b60b6af9b615a5cf2d366e2143582557cff711',
            expiry: 4294967295,
            data: {
                '1': { blockInfo, bids: null, asks: null },
                '200': { blockInfo, bids: [level], asks: [] },
            },
        });

        expect(decodeOrderBookStream(merged).depths).toEqual({
            '1': { blockInfo, bids: [], asks: [] },
            '200': { blockInfo, bids: [level], asks: [] },
        });
    });

    it('rejects order book depths with invalid level items', () => {
        expect(() =>
            decodeOrderBookStream({
                chainId: 1,
                instrument: '0xAbCdEf0000000000000000000000000000000000',
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
        ).toThrow('Invalid depths.1.asks[0]: expected object');
    });
});
