import { MarketMakerModule } from '../../apis/mm';
import { KlineInterval, type AuthInfo } from '../../apis/interfaces';
import { HttpClient } from '../../utils/http';
import { apiEnvelopeResponse } from '../helpers/http';

type CapturedRequest = {
    url?: string;
};

function createMockHttpClient(captured: CapturedRequest, payload: unknown = []): HttpClient {
    const client = new HttpClient();
    jest.spyOn(client, 'get').mockImplementation(async (url) => {
        captured.url = url;
        return apiEnvelopeResponse(payload);
    });
    return client;
}

const ticker = {
    closeTime24h: 1,
    expiry: 1,
    highPrice24h: 1,
    lowPrice24h: 1,
    openPrice24h: 1,
    openTime24h: 1,
    timestamp: 1,
    fundingRate: '1',
    lastPrice: '1',
    markPrice: '1',
    openInterest: '1',
    priceChange24H: '1',
    priceChangePercent24h: '1',
    quoteVolume24h: '1',
    spotPrice: '1',
    symbol: 'BTC/USDC',
    volume24h: '1',
    instrumentAddress: '0x0000000000000000000000000000000000000001',
};

describe('MarketMakerModule.fetchTickers', () => {
    const authInfo: AuthInfo = {
        apiKey: 'test-api-key',
        passphrase: 'test-passphrase',
        secretKey: 'test-secret',
    };

    it('omits symbol when it is undefined', async () => {
        const captured: CapturedRequest = {};
        const httpClient = createMockHttpClient(captured, [ticker]);
        const module = new MarketMakerModule(httpClient, authInfo);

        await expect(module.fetchTickers({ chainId: 1 })).resolves.toEqual([ticker]);

        expect(captured.url).toBe('/v4/public/mm/tickers?chainId=1');
        expect(captured.url).not.toContain('symbol=undefined');
    });

    it('includes symbol when it is provided', async () => {
        const captured: CapturedRequest = {};
        const httpClient = createMockHttpClient(captured, ticker);
        const module = new MarketMakerModule(httpClient, authInfo);

        await expect(module.fetchTickers({ chainId: 1, symbol: 'BTC/USDC' })).resolves.toEqual([ticker]);

        expect(captured.url).toBe('/v4/public/mm/tickers?chainId=1&symbol=BTC%2FUSDC');
    });
});

describe('MarketMakerModule request contracts', () => {
    it('validates rows and pagination after a successful envelope', async () => {
        const signer = {
            sign: async () => ({
                'X-ACCESS-KEY': '',
                'X-ACCESS-SIGN': '',
                'X-ACCESS-TIMESTAMP': '',
                'X-ACCESS-PASSPHRASE': '',
            }),
        };
        const rows = new MarketMakerModule(createMockHttpClient({}, [{}]), signer);
        await expect(rows.fetchKline({ chainId: 1, symbol: 'BTC/USDC', interval: KlineInterval.HOUR })).rejects.toThrow(
            'baseVolume'
        );
        await expect(rows.fetchOrderRealtime({ chainId: 1, address: 'test' })).rejects.toThrow('balance');
        const pages = new MarketMakerModule(createMockHttpClient({}, { list: [] }), signer);
        await expect(pages.fetchTradeHistory({ chainId: 1, address: 'test' })).rejects.toThrow('totalCount');
    });

    it('sends the kline interval the server requires', async () => {
        const captured: CapturedRequest = {};
        const module = new MarketMakerModule(createMockHttpClient(captured), {
            apiKey: 'test-api-key',
            passphrase: 'test-passphrase',
            secretKey: 'test-secret',
        });

        await module.fetchKline({ chainId: 1, symbol: 'BTC/USDC', interval: KlineInterval.HOUR });
        expect(captured.url).toBe('/v4/public/mm/kline?chainId=1&interval=1h&symbol=BTC%2FUSDC');
    });
});
