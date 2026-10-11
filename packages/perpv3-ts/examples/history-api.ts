import type { Address } from 'viem';
import { randomUUID } from 'crypto';
import { HistoryModule, HISTORY_RANGE, PublicModule } from '@synfutures/perpv3-ts/apis';
import { HttpClient } from '@synfutures/perpv3-ts/utils';
import 'dotenv/config';
import { ApiSign } from './sign';
import { PERP_EXPIRY } from '@synfutures/perpv3-ts';

const CHAIN_ID = 143;
const INSTRUMENT = '0x73ada1ea346cc3908f41cf67a040f0acd7808be0' as Address;
const USER_ADDRESS = '0xB0B81c2c7686c63acAE28F9778ca8Fa80f0C004b' as Address;

async function main(): Promise<void> {
    console.log('=== History API examples ===');
    const nonce = randomUUID();
    const signer = new ApiSign(nonce);
    const httpClient = new HttpClient();
    const publicApi = new PublicModule(httpClient, signer);
    const history = new HistoryModule(httpClient, signer);
    try {
        const portfolioList = await publicApi.fetchPortfolioList({ chainId: CHAIN_ID, userAddress: USER_ADDRESS });
        console.log('portfolioList: ', portfolioList);

        const tradingHistory = await history.fetchTradeHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
            instrumentAddress: INSTRUMENT,
            expiry: PERP_EXPIRY,
            timeRange: HISTORY_RANGE.ALL,
        });
        console.log('tradingHistory with instrument: ', tradingHistory);

        const tradingHistoryWithoutInstrument = await history.fetchTradeHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
        });
        console.log('tradingHistory without instrument: ', tradingHistoryWithoutInstrument);

        const ordersHistory = await history.fetchOrdersHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
            instrumentAddress: INSTRUMENT,
            expiry: PERP_EXPIRY,
            timeRange: HISTORY_RANGE.ALL,
        });
        console.log('ordersHistory with instrument: ', ordersHistory);

        const ordersHistoryWithoutInstrument = await history.fetchOrdersHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
        });
        console.log('ordersHistory without instrument: ', ordersHistoryWithoutInstrument);

        const fundingHistory = await history.fetchFundingHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
            instrumentAddress: INSTRUMENT,
            expiry: PERP_EXPIRY,
            timeRange: HISTORY_RANGE.ALL,
        });
        console.log('fundingHistory with instrument: ', fundingHistory);

        const fundingHistoryWithoutInstrument = await history.fetchFundingHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
        });
        console.log('fundingHistory without instrument: ', fundingHistoryWithoutInstrument);

        const liquidityHistory = await history.fetchLiquidityHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
            instrumentAddress: INSTRUMENT,
            expiry: PERP_EXPIRY,
            timeRange: HISTORY_RANGE.ALL,
        });
        console.log('liquidityHistory with instrument: ', liquidityHistory);

        const liquidityHistoryWithoutInstrument = await history.fetchLiquidityHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
        });
        console.log('liquidityHistory without instrument: ', liquidityHistoryWithoutInstrument);

        const transferHistory = await history.fetchTransferHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
            instrumentAddress: INSTRUMENT,
            expiry: PERP_EXPIRY,
            timeRange: HISTORY_RANGE.ALL,
        });
        console.log('transferHistory with instrument: ', transferHistory);
        const transferHistoryWithoutInstrument = await history.fetchTransferHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
        });
        console.log('transferHistory without instrument: ', transferHistoryWithoutInstrument);

        const accountBalanceHistory = await history.fetchAccountBalanceHistory({
            chainId: CHAIN_ID,
            userAddress: USER_ADDRESS,
            timeRange: HISTORY_RANGE.ALL,
        });
        console.log('accountBalanceHistory: ', accountBalanceHistory);
    } catch (error) {
        console.error('error : ', error);
    }
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
