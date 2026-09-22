import { MarketMakerModule } from '../../apis/mm';
import type { AuthInfo } from '../../apis/interfaces';
import { HttpClient } from '../../utils/axios';
import { apiEnvelopeResponse } from '../helpers/http';

type CapturedRequest = {
    url?: string;
};

function createMockHttpClient(captured: CapturedRequest): HttpClient {
    const client = new HttpClient();
    jest.spyOn(client, 'get').mockImplementation(async (url) => {
        captured.url = url;
        return apiEnvelopeResponse([]);
    });
    return client;
}

describe('MarketMakerModule.fetchTickers', () => {
    const authInfo: AuthInfo = {
        apiKey: 'test-api-key',
        passphrase: 'test-passphrase',
        secretKey: 'test-secret',
    };

    it('omits symbol when it is undefined', async () => {
        const captured: CapturedRequest = {};
        const httpClient = createMockHttpClient(captured);
        const module = new MarketMakerModule(httpClient, authInfo);

        await module.fetchTickers({ chainId: 1 });

        expect(captured.url).toBe('/v4/public/mm/tickers?chainId=1');
        expect(captured.url).not.toContain('symbol=undefined');
    });

    it('includes symbol when it is provided', async () => {
        const captured: CapturedRequest = {};
        const httpClient = createMockHttpClient(captured);
        const module = new MarketMakerModule(httpClient, authInfo);

        await module.fetchTickers({ chainId: 1, symbol: 'BTC/USDC' });

        expect(captured.url).toBe('/v4/public/mm/tickers?chainId=1&symbol=BTC%2FUSDC');
    });
});
