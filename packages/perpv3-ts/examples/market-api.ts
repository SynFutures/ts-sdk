import type { Address } from 'viem';
import { randomUUID } from 'crypto';
import { MarketModule, TokenModule } from '@synfutures/perpv3-ts/apis';
import { HttpClient } from '@synfutures/perpv3-ts/utils';
import 'dotenv/config';
import { ApiSign } from './sign';
import { PERP_EXPIRY } from '@synfutures/perpv3-ts';

const CHAIN_ID = 143;
const INSTRUMENT = '0x73ada1ea346cc3908f41cf67a040f0acd7808be0' as Address;

async function main(): Promise<void> {
    console.log('=== Market API examples ===');
    const nonce = randomUUID();
    const signer = new ApiSign(nonce);
    const httpClient = new HttpClient();
    const market = new MarketModule(httpClient, signer);
    const token = new TokenModule(httpClient, signer);
    try {
        const futuresInstrument = await market.fetchFuturesInstrument({ chainId: CHAIN_ID, address: INSTRUMENT });
        console.log('futuresInstrument : ', futuresInstrument);
        const futuresPairOrderBook = await market.fetchFuturesPairOrderBook({
            chainId: CHAIN_ID,
            address: INSTRUMENT,
            expiry: PERP_EXPIRY,
        });
        console.log('futuresPairOrderBook : ', futuresPairOrderBook);

        const marketList = await market.fetchMarketPairList({ chainId: CHAIN_ID });
        console.log('marketList : ', marketList);

        const tokenPriceMap = await token.fetchTokenPriceMap({ chainId: CHAIN_ID });
        console.log('tokenPriceMap : ', tokenPriceMap);
    } catch (error) {
        console.error('error : ', error);
    }
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
