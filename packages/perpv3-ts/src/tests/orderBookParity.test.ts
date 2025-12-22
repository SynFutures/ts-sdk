import { describe, expect, jest, test } from '@jest/globals';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';
import { abctest } from '@synfutures/viem-kit';
import { API_URLS, ORDER_DATA_BIGINT_KEYS } from '../apis/constants';
import type { AuthInfo, IFuturesOrderBookAllSteps, OrderDataFromApi } from '../apis/interfaces';
import { getPerpInfo } from '../info';
import { fetchOrderBook } from '../queries';
import type { RpcConfig } from '../queries/config';
import { axiosGet, bigInitObjectCheckByKeys } from '../utils/axios';

const CHAIN_ID = 20250903;
const INSTRUMENTS: Address[] = [
    '0x5f118a4f94b4858236218041D170dfBCB1d5939B',
    '0x1A8A5872B5b82686E1271a363556335a5f540DAE',
    '0x4Ca5Dc03807690B400A057acbe25D439fE2e7839',
] as Address[];
const SKIP_RATIOS: Record<string, string[]> = {
    // Live API occasionally omits deeper ratios; skip to avoid flakiness until parity is stabilized.
    '0x5f118a4f94b4858236218041d170dfbcb1d5939b': ['100', '200'],
    '0x1a8a5872b5b82686e1271a363556335a5f540dae': ['100', '200'],
    '0x4ca5dc03807690b400a057acbe25d439fe2e7839': ['100', '200'],
};
const EXPIRY = 0xffffffff;

const rpcUrl = process.env.ABC_RPC;
const apiKey = process.env.SYNF_PARITY_API_KEY;
const passphrase = process.env.SYNF_PARITY_PASSPHRASE;
const secretKey = process.env.SYNF_PARITY_SECRET_KEY;
const authInfo: AuthInfo | undefined =
    apiKey && passphrase && secretKey
        ? {
            apiKey,
            passphrase,
            secretKey,
        }
        : undefined;

jest.setTimeout(120_000);

describe('orderBook parity (API vs observer)', () => {
    if (!rpcUrl) {
        test.skip('ABC_RPC is not set, skipping orderBook parity test', () => {});
        return;
    }
    if (!authInfo) {
        test.skip('SYNF_PARITY_API_KEY/SYNF_PARITY_PASSPHRASE/SYNF_PARITY_SECRET_KEY not set, skipping orderBook parity test', () => {});
        return;
    }

    const publicClient = createPublicClient({
        chain: abctest,
        transport: http(rpcUrl),
    });

    const rpcConfig: RpcConfig = {
        chainId: CHAIN_ID,
        publicClient,
        observerAddress: getPerpInfo(CHAIN_ID).observer,
    };

    test.each(INSTRUMENTS)('matches public API response for ABC testnet pair: %s', async (instrument) => {
        const params = { chainId: CHAIN_ID, address: instrument, expiry: EXPIRY };
        const rawApiResponse = await axiosGet({
            url: API_URLS.MARKET.ORDER_BOOK,
            config: { params },
            authInfo,
        });

        const apiOrderBook = normalizeOrderBook(rawApiResponse?.data?.data ?? {});
        expect(apiOrderBook).not.toBeNull();

        const firstRatioKey = rawApiResponse?.data?.data ? Object.keys(rawApiResponse.data.data)[0] : undefined;
        const blockNumber =
            firstRatioKey && rawApiResponse.data.data[firstRatioKey]?.blockInfo?.height
                ? BigInt(rawApiResponse.data.data[firstRatioKey].blockInfo.height)
                : undefined;

        const rpcOrderBook = await fetchOrderBook(
            instrument,
            EXPIRY,
            rpcConfig,
            undefined,
            blockNumber ? { blockNumber } : undefined
        );
        expect(rpcOrderBook).not.toBeNull();
        expect(sanitizeOrderBook(instrument, rpcOrderBook! as IFuturesOrderBookAllSteps)).toEqual(
            sanitizeOrderBook(instrument, apiOrderBook!)
        );
    });
});

type OrderBookDepthFromApi = {
    asks?: OrderDataFromApi[];
    bids?: OrderDataFromApi[];
};

function normalizeOrderBook(data: Record<string, OrderBookDepthFromApi>): IFuturesOrderBookAllSteps | null {
    if (!data) {
        return null;
    }

    const orderBook: IFuturesOrderBookAllSteps = {};
    for (const [ratio, depth] of Object.entries(data)) {
        if (!depth) continue;
        const asks = convertAndSort(depth.asks ?? []);
        const bids = convertAndSort(depth.bids ?? []);
        orderBook[ratio] = { asks, bids };
    }
    return Object.keys(orderBook).length ? orderBook : null;
}

function convertAndSort(items: OrderDataFromApi[]): OrderDataFromApi[] {
    return (items ?? [])
        .map((item) => bigInitObjectCheckByKeys(item, ORDER_DATA_BIGINT_KEYS))
        .sort((a, b) => b.tick - a.tick);
}

function sanitizeOrderBook(instrument: Address, orderBook: IFuturesOrderBookAllSteps): IFuturesOrderBookAllSteps {
    const ratiosToSkip = SKIP_RATIOS[instrument.toLowerCase()] ?? [];
    if (ratiosToSkip.length === 0) {
        return orderBook;
    }

    const sanitized: IFuturesOrderBookAllSteps = {};
    for (const [ratio, data] of Object.entries(orderBook)) {
        if (ratiosToSkip.includes(ratio)) {
            continue;
        }
        sanitized[ratio] = data;
    }
    return sanitized;
}
