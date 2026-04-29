import { describe, expect, jest, test } from '@jest/globals';
import type { Address, PublicClient } from 'viem';
import type { ApiSigner } from '../apis/interfaces';
import { fetchFuturesInstrumentInquireByNotional, httpClient } from '../apis';
import { WAD } from '../constants';
import { PerpClient } from '../client';
import { inquireByBaseSize, type ApiConfig, type RpcConfig } from '../queries';
import { UserSetting } from '../types';
import { HttpClient } from '../utils';

const CHAIN_ID = 8453;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const OBSERVER_ADDRESS = '0x0000000000000000000000000000000000000002' as Address;
const SQRT_PX96_ONE = 79228162514264337593543950336n; // 2^96

function buildMockRpcConfig(instrument: Address, expiry: number): RpcConfig {
    const rawContext = {
        setting: {
            symbol: 'TEST',
            config: ZERO_ADDRESS,
            gate: ZERO_ADDRESS,
            market: ZERO_ADDRESS,
            quote: ZERO_ADDRESS,
            decimals: 18,
            initialMarginRatio: 100,
            maintenanceMarginRatio: 50,
            placePaused: false,
            fundingHour: 0,
            disableOrderRebate: false,
            param: {
                minMarginAmount: 0n,
                tradingFeeRatio: 0,
                protocolFeeRatio: 0,
                qtype: 0,
                tip: 0n,
            },
        },
        condition: 0,
        amm: {
            expiry,
            timestamp: 0,
            status: 1,
            tick: 0,
            sqrtPX96: SQRT_PX96_ONE,
            liquidity: 1n,
            totalLiquidity: 1n,
            totalShort: 0n,
            openInterests: 0n,
            totalLong: 0n,
            involvedFund: 0n,
            feeIndex: 0n,
            protocolFee: 0n,
            longSocialLossIndex: 0n,
            shortSocialLossIndex: 0n,
            longFundingIndex: 0n,
            shortFundingIndex: 0n,
            insuranceFund: 0n,
            settlementPrice: 0n,
        },
        priceData: {
            instrument,
            expiry,
            markPrice: 0n,
            spotPrice: 0n,
            benchmarkPrice: 0n,
            feeder0: ZERO_ADDRESS,
            feeder1: ZERO_ADDRESS,
            feeder0UpdatedAt: 0n,
            feeder1UpdatedAt: 0n,
        },
        portfolio: {
            oids: [],
            rids: [],
            position: {
                balance: 0n,
                size: 0n,
                entryNotional: 0n,
                entrySocialLossIndex: 0n,
                entryFundingIndex: 0n,
            },
            orders: [],
            ranges: [],
            ordersTaken: [],
        },
        quotation: {
            benchmark: 0n,
            sqrtFairPX96: 0n,
            tick: 0,
            mark: 0n,
            entryNotional: 0n,
            fee: 0n,
            minAmount: 0n,
            sqrtPostFairPX96: 0n,
            postTick: 0,
        },
        quoteState: {
            quote: ZERO_ADDRESS,
            decimals: 18,
            symbol: 'USDC',
            threshold: 0n,
            reserve: 0n,
            balance: 0n,
            allowance: 0n,
            fundFlow: {
                totalIn: 0n,
                totalOut: 0n,
            },
            pending: {
                timestamp: 0,
                native: false,
                amount: 0n,
                exemption: 0n,
            },
        },
        spacing: {
            pearl: 1,
            order: 1,
            range: 1,
        },
        blockInfo: {
            timestamp: 0,
            height: 0,
        },
    };

    const multicall = jest.fn(async () => [rawContext]);
    const readContract = jest.fn(async (request: unknown) => {
        const functionName = (request as { functionName?: string }).functionName;
        switch (functionName) {
            case 'inquireByTick':
                return [0n, rawContext.quotation] as const;
            case 'inquireByBase':
                return [rawContext.quotation, { timestamp: 0, height: 0 }] as const;
            case 'liquidityDetails':
                return [
                    { sqrtPX96: SQRT_PX96_ONE, tick: 0, liquidity: 1n },
                    [] as const,
                    [] as const,
                    { timestamp: 0, height: 0 },
                ] as const;
            default:
                throw new Error(`Unexpected readContract functionName: ${String(functionName)}`);
        }
    });

    const publicClient = { multicall, readContract } as unknown as PublicClient;

    return {
        chainId: CHAIN_ID,
        publicClient,
        observerAddress: OBSERVER_ADDRESS,
    };
}

describe('PerpClient fallback (API -> rpcFallback)', () => {
    const userSetting = new UserSetting(10, 10, 1n * WAD, 1);

    test('constructor throws on chainId mismatch between ApiConfig and rpcFallback', () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const rpcFallback = buildMockRpcConfig(instrument, expiry);

        const apiConfig: ApiConfig = {
            chainId: CHAIN_ID + 1,
            signer: { sign: () => ({}) },
        };

        expect(() => new PerpClient(apiConfig, userSetting, instrument, expiry, { rpcFallback })).toThrow(
            'rpcFallback.chainId'
        );
    });

    test('getSnapshot falls back to rpcFallback when API fails', async () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const rpcFallback = buildMockRpcConfig(instrument, expiry);

        const signer: ApiSigner = {
            sign: () => {
                throw new Error('signer not available');
            },
        };

        const apiConfig: ApiConfig = {
            chainId: CHAIN_ID,
            signer,
        };

        const client = new PerpClient(apiConfig, userSetting, instrument, expiry, { rpcFallback });
        const snapshot = await client.getSnapshot();
        expect(snapshot.instrumentAddress).toBe(instrument);
    });

    test('getQuotation falls back to rpcFallback when API fails', async () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const rpcFallback = buildMockRpcConfig(instrument, expiry);

        const signer: ApiSigner = {
            sign: () => {
                throw new Error('signer not available');
            },
        };

        const apiConfig: ApiConfig = {
            chainId: CHAIN_ID,
            signer,
        };

        const client = new PerpClient(apiConfig, userSetting, instrument, expiry, { rpcFallback });
        const quotation = await client.getQuotation(0);
        expect(quotation.size).toBe(0n);
        expect(quotation.quotation.tick).toBe(0);
    });

    test('inquire falls back to rpcFallback when API fails', async () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const rpcFallback = buildMockRpcConfig(instrument, expiry);

        const signer: ApiSigner = {
            sign: () => {
                throw new Error('signer not available');
            },
        };

        const apiConfig: ApiConfig = {
            chainId: CHAIN_ID,
            signer,
        };

        const client = new PerpClient(apiConfig, userSetting, instrument, expiry, { rpcFallback });
        const quotation = await client.inquire(1n);
        expect(quotation.tick).toBe(0);
    });

    test('getOrderBook falls back to rpcFallback when API fails', async () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const rpcFallback = buildMockRpcConfig(instrument, expiry);

        const signer: ApiSigner = {
            sign: () => {
                throw new Error('signer not available');
            },
        };

        const apiConfig: ApiConfig = {
            chainId: CHAIN_ID,
            signer,
        };

        const client = new PerpClient(apiConfig, userSetting, instrument, expiry, { rpcFallback });

        // length=0 keeps the orderbook-side construction minimal for tests.
        const orderBook = await client.getOrderBook(0);
        expect(orderBook).not.toBeNull();
    });

    test('getOrderBook falls back to rpcFallback when API returns null', async () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const rpcFallback = buildMockRpcConfig(instrument, expiry);

        const signer: ApiSigner = { sign: () => ({}) };

        const apiConfig: ApiConfig = {
            chainId: CHAIN_ID,
            signer,
        };

        const getSpy = jest.spyOn(httpClient, 'get').mockResolvedValue({ data: { data: null } } as any);
        const client = new PerpClient(apiConfig, userSetting, instrument, expiry, { rpcFallback });

        // length=0 keeps the orderbook-side construction minimal for tests.
        const orderBook = await client.getOrderBook(0);
        expect(orderBook).not.toBeNull();
        expect(getSpy).toHaveBeenCalled();

        getSpy.mockRestore();
    });
});

describe('direct API query helpers', () => {
    test('inquireByBaseSize honors ApiConfig.baseUrl instead of using the global httpClient', async () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const signer: ApiSigner = { sign: () => ({}) };

        const globalGetSpy = jest.spyOn(httpClient, 'get').mockImplementation(async () => {
            throw new Error('global-client-used');
        });
        const customGetSpy = jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({
            data: {
                data: {
                    benchmark: '0',
                    sqrtFairPX96: '0',
                    tick: 0,
                    mark: '0',
                    entryNotional: '0',
                    fee: '0',
                    minAmount: '0',
                    sqrtPostFairPX96: '0',
                    postTick: 0,
                },
            },
        } as any);

        try {
            const quotation = await inquireByBaseSize(instrument, expiry, 1n, {
                chainId: CHAIN_ID,
                baseUrl: 'https://custom.example',
                signer,
            });

            expect(quotation.tick).toBe(0);
            expect(globalGetSpy).not.toHaveBeenCalled();
            expect(customGetSpy).toHaveBeenCalled();
        } finally {
            customGetSpy.mockRestore();
            globalGetSpy.mockRestore();
        }
    });

    test('fetchFuturesInstrumentInquireByNotional honors custom HttpClient instead of the global one', async () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const signer: ApiSigner = { sign: () => ({}) };

        const globalGetSpy = jest.spyOn(httpClient, 'get').mockImplementation(async () => {
            throw new Error('global-client-used');
        });
        const customGetSpy = jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({
            data: {
                data: {
                    benchmark: '0',
                    sqrtFairPX96: '0',
                    tick: 0,
                    mark: '0',
                    entryNotional: '0',
                    fee: '0',
                    size: '0',
                    minAmount: '0',
                    sqrtPostFairPX96: '0',
                    postTick: 0,
                },
            },
        } as any);

        try {
            const quotation = await fetchFuturesInstrumentInquireByNotional(
                {
                    chainId: CHAIN_ID,
                    instrument,
                    expiry,
                    notional: '1000000000000000000',
                    long: true,
                },
                signer,
                new HttpClient({ baseUrl: 'https://custom.example' }),
            );

            expect(quotation).not.toBeNull();
            expect(quotation).toMatchObject({ tick: 0 });
            expect(globalGetSpy).not.toHaveBeenCalled();
            expect(customGetSpy).toHaveBeenCalled();
        } finally {
            customGetSpy.mockRestore();
            globalGetSpy.mockRestore();
        }
    });
});
