import { describe, expect, jest, test } from '@jest/globals';
import { mainnet } from 'viem/chains';
import { createPublicClient, custom, encodeFunctionResult, type Address } from 'viem';
import { getABI } from '../../abis';
import type { ApiSigner } from '../../apis/interfaces';
import { WAD } from '../../constants';
import { PerpClient } from '../../client';
import { inquireByBaseSize, type ApiConfig, type RpcConfig } from '../../queries';
import { UserSetting } from '../../types';
import { mockPublicClient } from '../helpers/viem';

const CHAIN_ID = 8453;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const OBSERVER_ADDRESS = '0x0000000000000000000000000000000000000002' as Address;
const SQRT_PX96_ONE = 79228162514264337593543950336n; // 2^96

function buildRawContext(instrument: Address, expiry: number) {
    return {
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
}

function buildMockRpcConfig(instrument: Address, expiry: number): RpcConfig {
    const rawContext = buildRawContext(instrument, expiry);
    const multicall = jest.fn();
    const readContract = jest.fn(async (request: unknown) => {
        const functionName = (request as { functionName?: string }).functionName;
        switch (functionName) {
            case 'fetchOnChainContext':
                return rawContext;
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

    const publicClient = mockPublicClient({ multicall, readContract });

    return {
        chainId: CHAIN_ID,
        publicClient,
        observer: { address: OBSERVER_ADDRESS, version: 'current' },
    };
}

describe('PerpClient fallback (API -> rpcFallback)', () => {
    const userSetting = new UserSetting({
        deadlineSeconds: 10,
        slippageBps: 10,
        leverageWad: 1n * WAD,
        markPriceBufferInBps: 1,
    });

    test('rejects a known wrong RPC chain before reading, including after an API failure', async () => {
        const rpc = buildMockRpcConfig(ZERO_ADDRESS, 1);
        const wrongChain = { ...rpc, publicClient: { ...rpc.publicClient, chain: mainnet } };
        await expect(inquireByBaseSize(ZERO_ADDRESS, 1, 1n, wrongChain)).rejects.toThrow('RPC client chain 1');
        const signer = {
            sign: jest.fn(() => {
                throw new Error('API unavailable');
            }),
        };
        const client = new PerpClient({ chainId: CHAIN_ID, signer }, userSetting, ZERO_ADDRESS, 1, {
            rpcFallback: wrongChain,
        });
        await expect(client.inquire(1n)).rejects.toMatchObject({
            cause: expect.objectContaining({ message: expect.stringContaining('RPC client chain 1') }),
        });
        expect(signer.sign).toHaveBeenCalled();
        expect(rpc.publicClient.readContract).not.toHaveBeenCalled();
        expect(rpc.publicClient.multicall).not.toHaveBeenCalled();
        await expect(inquireByBaseSize(ZERO_ADDRESS, 1, 1n, rpc)).resolves.toBeDefined();
    });

    test('reads a pinned snapshot directly from the Observer with a chainless viem client', async () => {
        const abi = getABI('current', 'Observer');
        const response = encodeFunctionResult({
            abi,
            functionName: 'fetchOnChainContext',
            result: buildRawContext(ZERO_ADDRESS, 1),
        });
        const request = jest.fn(async (_rpc: { method: string; params?: unknown }) => response);
        const publicClient = createPublicClient({ transport: custom({ request }) });
        const client = new PerpClient(
            { chainId: CHAIN_ID, publicClient, observer: { address: OBSERVER_ADDRESS, version: 'current' } },
            userSetting,
            ZERO_ADDRESS,
            1
        );
        const snapshot = await client.getSnapshot(undefined, undefined, { blockNumber: 21n });
        expect(snapshot.instrumentAddress).toBe(ZERO_ADDRESS);
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                method: 'eth_call',
                params: [expect.objectContaining({ to: OBSERVER_ADDRESS }), '0x15'],
            })
        );
    });

    test('compares the instrument address and expiry when matching pairs', () => {
        const instrument = '0x000000000000000000000000000000000000dead';
        const checksum = '0x000000000000000000000000000000000000dEaD';
        const client = new PerpClient({ chainId: CHAIN_ID }, userSetting, instrument, 1);
        expect(client.isForPair(checksum, 1)).toBe(true);
        expect(client.isForPair(ZERO_ADDRESS, 1)).toBe(false);
        expect(client.isForPair(checksum, 2)).toBe(false);
    });

    test('isolates default WebSockets and shares only an explicitly supplied client', () => {
        const config = { chainId: CHAIN_ID };
        const first = new PerpClient(config, userSetting, ZERO_ADDRESS, 1);
        const second = new PerpClient(config, userSetting, ZERO_ADDRESS, 1);
        expect(first.websocket).not.toBe(second.websocket);
        expect(new PerpClient(config, userSetting, ZERO_ADDRESS, 1, { websocket: first.websocket }).websocket).toBe(
            first.websocket
        );
    });

    test('rejects a legacy Observer context before sending an RPC request', async () => {
        const rpc = buildMockRpcConfig(ZERO_ADDRESS, 1);
        const client = new PerpClient(
            { ...rpc, observer: { ...rpc.observer, version: 'legacy' } },
            userSetting,
            ZERO_ADDRESS,
            1
        );
        await expect(client.getSnapshot()).rejects.toThrow('current Observer');
        expect(rpc.publicClient.multicall).not.toHaveBeenCalled();
    });

    test('reads each latest order book level at the height returned by its context', async () => {
        const config = buildMockRpcConfig(ZERO_ADDRESS, 1);
        const client = new PerpClient(config, userSetting, ZERO_ADDRESS, 1);
        await client.getOrderBook();
        expect(config.publicClient.multicall).not.toHaveBeenCalled();
        const reads = jest.mocked(config.publicClient.readContract).mock.calls;
        expect(reads.length).toBeGreaterThan(1);
        expect(reads[0][0].functionName).toBe('fetchOnChainContext');
        for (const [request] of reads.slice(1)) expect(request).toMatchObject({ blockNumber: 0n });
        await expect(client.getOrderBook(1, { blockTag: 'pending' })).rejects.toThrow('cannot be pinned');
    });

    test('block zero bypasses the API and pins every liquidity read', async () => {
        const rpcFallback = buildMockRpcConfig(ZERO_ADDRESS, 0xffffffff);
        const signer = {
            sign: jest.fn(() => {
                throw new Error('unexpected API call');
            }),
        };
        const config = { chainId: CHAIN_ID, signer };
        const client = new PerpClient(config, userSetting, ZERO_ADDRESS, 0xffffffff, { rpcFallback });
        await client.getOrderBook(0, { blockNumber: 0n });
        expect(signer.sign).not.toHaveBeenCalled();
        expect(rpcFallback.publicClient.readContract).toHaveBeenCalledWith(
            expect.objectContaining({ blockNumber: 0n })
        );
        await expect(inquireByBaseSize(ZERO_ADDRESS, 0xffffffff, 1n, config, { blockTag: 'earliest' })).rejects.toThrow(
            'require an RPC'
        );
    });

    test.each([
        ['getSnapshot', (client: PerpClient) => client.getSnapshot()],
        ['getQuotation', (client: PerpClient) => client.getQuotation(0)],
        ['inquire', (client: PerpClient) => client.inquire(1n)],
        ['getOrderBook', (client: PerpClient) => client.getOrderBook(0)],
    ] as const)('%s retains both original errors when API and RPC fail', async (method, query) => {
        const apiError = new Error('API signer unavailable');
        const rpcError = new Error('RPC unavailable');
        const failRpc = jest.fn(async () => {
            throw rpcError;
        });
        const rpcFallback: RpcConfig = {
            chainId: CHAIN_ID,
            observer: { address: OBSERVER_ADDRESS, version: 'current' },
            publicClient: mockPublicClient({ multicall: failRpc, readContract: failRpc }),
        };
        const client = new PerpClient(
            {
                chainId: CHAIN_ID,
                signer: {
                    sign: () => {
                        throw apiError;
                    },
                },
            },
            userSetting,
            ZERO_ADDRESS,
            0xffffffff,
            { rpcFallback }
        );

        expect.assertions(4);
        try {
            await query(client);
        } catch (error) {
            expect(error).toBeInstanceOf(AggregateError);
            if (!(error instanceof AggregateError)) throw error;
            expect(error.message).toContain(`PerpClient.${method} failed`);
            expect(error.errors[0]).toBe(apiError);
            expect(error.errors[1]).toBe(rpcError);
        }
    });

    test('constructor throws on chainId mismatch between ApiConfig and rpcFallback', () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const rpcFallback = buildMockRpcConfig(instrument, expiry);

        const apiConfig: ApiConfig = {
            chainId: CHAIN_ID + 1,
            signer: { sign: () => ({ 'X-Api-Nonce': 'test', 'X-Api-Sign': 'test', 'X-Api-Ts': 0 }) },
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

        const signer: ApiSigner = { sign: () => ({ 'X-Api-Nonce': 'test', 'X-Api-Sign': 'test', 'X-Api-Ts': 0 }) };
        const getSpy = jest.fn(async () => Response.json({ code: 0, data: null }));

        const apiConfig: ApiConfig = {
            chainId: CHAIN_ID,
            signer,
            fetch: getSpy,
        };

        const client = new PerpClient(apiConfig, userSetting, instrument, expiry, { rpcFallback });

        // length=0 keeps the orderbook-side construction minimal for tests.
        const orderBook = await client.getOrderBook(0);
        expect(orderBook).not.toBeNull();
        expect(getSpy).toHaveBeenCalled();
    });
});

describe('direct API query helpers', () => {
    test('notional quotes use the configured fetch and base URL', async () => {
        const customFetch = jest.fn(async (_url: Parameters<typeof fetch>[0]) =>
            Response.json({
                code: 0,
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
                    size: '1',
                },
            })
        );
        const signer: ApiSigner = { sign: () => ({ 'X-Api-Nonce': 'test', 'X-Api-Sign': 'test', 'X-Api-Ts': 0 }) };
        const client = new PerpClient(
            { chainId: CHAIN_ID, signer, baseUrl: 'https://custom.example', fetch: customFetch },
            new UserSetting({ slippageBps: 0, deadlineSeconds: 60, leverageWad: WAD }),
            ZERO_ADDRESS,
            1
        );
        await expect(
            client.market!.fetchFuturesInstrumentInquireByNotional({
                chainId: CHAIN_ID,
                instrument: ZERO_ADDRESS,
                expiry: 1,
                notional: '1',
                long: true,
            })
        ).resolves.toMatchObject({ tick: 0, size: 1n });
        expect(customFetch).toHaveBeenCalledTimes(1);
        const url = new URL(String(customFetch.mock.calls[0][0]));
        expect(url.origin + url.pathname).toBe('https://custom.example/v4/public/market/inquireByNotional');
    });

    test('inquireByBaseSize honors an explicit API fetch implementation', async () => {
        const instrument = '0x0000000000000000000000000000000000000001' as Address;
        const expiry = 0xffffffff;
        const signer: ApiSigner = { sign: () => ({ 'X-Api-Nonce': 'test', 'X-Api-Sign': 'test', 'X-Api-Ts': 0 }) };
        const customGetSpy = jest.fn(async () =>
            Response.json({
                code: 0,
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
            })
        );

        const quotation = await inquireByBaseSize(instrument, expiry, 1n, {
            chainId: CHAIN_ID,
            signer,
            fetch: customGetSpy,
        });

        expect(quotation.tick).toBe(0);
        expect(customGetSpy).toHaveBeenCalled();
    });
});
