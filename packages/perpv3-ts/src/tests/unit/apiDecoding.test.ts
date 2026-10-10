import { AxiosHeaders } from 'axios';
import type { Address } from 'viem';
import { getApiData, requireApiData, type ApiEnvelope } from '../../apis/base';
import {
    decodeDepthChartLiquidityDetails,
    decodeFuturesInstrument,
    decodeGateBalances,
    decodeMmInstrumentInfoList,
    decodeMmPositionList,
    decodeMmWalletBalance,
    decodeOrderBookSteps,
    decodePortfolioList,
    decodeQuotation,
    decodeQuotationWithSize,
} from '../../apis/decoders';
import { getPerpInfo } from '../../info';
import { parseJsonPreservingLargeIntegers, toBigIntValue } from '../../apis/codecs';
import { buildOnChainContextFromQuery } from '../../apis/utils';
import fixture from '../fixtures/simulation-context.json';
import { MarketModule } from '../../apis/market';
import { HistoryModule } from '../../apis/history';
import { PublicModule } from '../../apis/public';
import { KlineInterval, type ApiSigner } from '../../apis/interfaces';
import { fetchOnchainContext } from '../../queries/api';
import { HttpClient } from '../../utils';
import { apiEnvelopeResponse, axiosResponse } from '../helpers/http';
import { SynfError } from '../../types/error';

const signer: ApiSigner = {
    sign: () => ({
        'X-Api-Nonce': 'nonce',
        'X-Api-Sign': 'signature',
        'X-Api-Ts': 1,
    }),
};

function createMarketModule(payload: unknown): MarketModule {
    const httpClient = new HttpClient();
    jest.spyOn(httpClient, 'get').mockResolvedValue(apiEnvelopeResponse(payload));
    return new MarketModule(httpClient, signer);
}

function createHttpClient(payload: unknown): HttpClient {
    const httpClient = new HttpClient();
    jest.spyOn(httpClient, 'get').mockResolvedValue(apiEnvelopeResponse(payload));
    return httpClient;
}

function createInstrumentPayload(instrument: string, expiry: number, markPrice: bigint): Record<string, unknown> {
    const quote = '0x0000000000000000000000000000000000000002';
    const market = '0x0000000000000000000000000000000000000003';
    return {
        instrumentAddr: instrument,
        symbol: 'TEST-USDC',
        condition: 0,
        placePaused: false,
        fundingHour: 8,
        disableOrderRebate: false,
        spotPrice: '111',
        base: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'TEST',
        },
        quote: {
            address: quote,
            decimals: 18,
            symbol: 'USDC',
        },
        displayBase: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'TEST',
        },
        displayQuote: {
            address: quote,
            decimals: 18,
            symbol: 'USDC',
        },
        instrumentType: 1,
        marketType: 'LINK',
        minOrderValue: '1',
        minRangeValue: '1',
        minTickDelta: 1,
        minTradeValue: '1',
        market: {
            config: {
                dailyInterestRate: 0,
                feederSource: [],
            },
            feeder: null,
            info: {
                addr: market,
                beacon: '0x0000000000000000000000000000000000000004',
                type: 'LINK',
            },
        },
        setting: {
            initialMarginRatio: 1000,
            maintenanceMarginRatio: 500,
            quoteParam: {
                minMarginAmount: '1',
                tradingFeeRatio: 10,
                protocolFeeRatio: 5,
                qtype: 0,
                tip: '0',
            },
        },
        amms: [
            {
                expiry,
                timestamp: 1,
                status: 1,
                tick: 0,
                sqrtPX96: '1',
                liquidity: '1',
                totalLiquidity: '1',
                totalShort: '0',
                openInterests: '0',
                totalLong: '0',
                involvedFund: '0',
                feeIndex: '0',
                protocolFee: '0',
                longSocialLossIndex: '0',
                shortSocialLossIndex: '0',
                longFundingIndex: '0',
                shortFundingIndex: '0',
                insuranceFund: '0',
                settlementPrice: '0',
                blockInfo: {
                    timestamp: 1,
                    height: 1,
                },
                fairPrice: markPrice.toString(),
                instrumentAddr: instrument,
                markPrice: markPrice.toString(),
            },
        ],
        blockInfo: {
            timestamp: 1,
            height: 1,
        },
    };
}

function createInquirePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        benchmark: '100',
        sqrtFairPX96: '200',
        tick: 1,
        mark: '300',
        entryNotional: '400',
        fee: '5',
        minAmount: '6',
        sqrtPostFairPX96: '700',
        postTick: 2,
        ...overrides,
    };
}

describe('API decoding', () => {
    it('rejects empty instrument and portfolio objects', () => {
        expect(() => decodeFuturesInstrument({})).toThrow('Invalid futures instrument.instrumentAddr');
        expect(() => decodePortfolioList({})).toThrow('Invalid portfolio list.address');
    });

    it('rejects malformed order-book arrays instead of replacing them with empty arrays', () => {
        expect(() =>
            decodeOrderBookSteps({
                '0.01': {
                    bids: 'invalid',
                    asks: [],
                },
            })
        ).toThrow('Invalid order book 0.01.bids: expected array');
    });

    it('rejects malformed MM wallet portfolio arrays', () => {
        expect(() =>
            decodeMmWalletBalance({
                address: '0x0000000000000000000000000000000000000001',
                portfolios: {},
                isBlacklisted: false,
                pendingDuration: '1',
            })
        ).toThrow('Invalid MM wallet portfolios: expected array');
    });

    it('decodes MM instrument bigint fields to the declared domain type', () => {
        const [instrument] = decodeMmInstrumentInfoList([
            {
                base: { symbol: 'BTC' },
                disableMakerOrderRebate: false,
                fundingIntervalHour: 8,
                initialMarginRatio: 1000,
                instrumentAddress: '0x0000000000000000000000000000000000000001',
                instrumentCondition: 'NORMAL',
                maintenanceMarginRatio: 500,
                market: {
                    address: '0x0000000000000000000000000000000000000002',
                    type: 'CEX',
                },
                minMarginAmount: '100',
                protocolFeeRatio: 10,
                quote: {
                    address: '0x0000000000000000000000000000000000000003',
                    symbol: 'USDC',
                    decimals: 6,
                },
                quoteType: 'STABLE',
                symbol: 'BTC/USDC',
                tip: '2',
                tradingFeeRatio: 20,
            },
        ]);

        expect(instrument?.minMarginAmount).toBe(100n);
        expect(instrument?.tip).toBe(2n);
    });

    it('unwraps falsy API envelope data without treating it as missing', () => {
        const response = apiEnvelopeResponse(0);

        expect(getApiData(response)).toBe(0);
    });

    it('normalizes missing API envelope data to null', () => {
        const response = axiosResponse<ApiEnvelope<number>>({});

        expect(getApiData(response)).toBeNull();
    });

    it('unwraps required falsy API envelope data', () => {
        const response = apiEnvelopeResponse(0);

        expect(requireApiData(response, 'server time')).toBe(0);
    });

    it('throws when required API envelope data is missing', () => {
        const response = axiosResponse<ApiEnvelope<number>>({});

        expect(() => requireApiData(response, 'server time')).toThrow('Missing API response data for server time');
    });

    it('does not silently default missing inquire-by-tick size to zero', async () => {
        const market = createMarketModule(createInquirePayload());

        await expect(
            market.fetchFuturesInstrumentInquireByTick({
                chainId: 1,
                instrument: '0x0000000000000000000000000000000000000001',
                expiry: 1,
                tick: 1,
            })
        ).rejects.toThrow('Invalid size: expected integer string');
    });

    it('does not silently default missing inquire-by-notional size to zero', async () => {
        const market = createMarketModule(createInquirePayload());

        await expect(
            market.fetchFuturesInstrumentInquireByNotional({
                chainId: 1,
                instrument: '0x0000000000000000000000000000000000000001',
                expiry: 1,
                notional: '100',
                long: true,
            })
        ).rejects.toThrow('Invalid size: expected integer string');
    });

    it('keeps explicit zero inquire size', async () => {
        const market = createMarketModule(createInquirePayload({ size: '0' }));

        const result = await market.fetchFuturesInstrumentInquireByTick({
            chainId: 1,
            instrument: '0x0000000000000000000000000000000000000001',
            expiry: 1,
            tick: 1,
        });

        expect(result?.size).toBe(0n);
    });

    it('uses mark price as benchmark fallback when context priceData is absent', async () => {
        const instrument = '0x0000000000000000000000000000000000000001';
        const expiry = 1_700_000_000;
        const markPrice = 222n;

        const snapshot = await fetchOnchainContext(instrument, expiry, {
            chainId: 8453,
            signer,
            httpClient: createHttpClient({
                instrument: createInstrumentPayload(instrument, expiry, markPrice),
            }),
        });

        expect(snapshot.instrumentSetting.configAddress).toBe(getPerpInfo(8453).config);
        expect(snapshot.priceData.markPrice).toBe(markPrice);
        expect(snapshot.priceData.benchmarkPrice).toBe(markPrice);
    });

    it('decodes a market without a beacon and rejects unknown enum codes', () => {
        const instrument = '0x0000000000000000000000000000000000000001';
        const payload = createInstrumentPayload(instrument, 1, 1n);
        const market = payload.market as { info: Record<string, unknown> };
        // The live Base API sends an empty beacon for LINK markets.
        market.info.beacon = '';
        expect(decodeFuturesInstrument(payload)?.market.info).toEqual({
            addr: '0x0000000000000000000000000000000000000003',
            type: 'LINK',
        });

        const [amm] = payload.amms as Record<string, unknown>[];
        amm.status = 99;
        expect(() => decodeFuturesInstrument(payload)).toThrow(
            'Invalid futures instrument.amms[0].status: unsupported value 99'
        );
        amm.status = 1;
        (payload.setting as { quoteParam: Record<string, unknown> }).quoteParam.qtype = 9;
        expect(() => decodeFuturesInstrument(payload)).toThrow(
            'Invalid futures instrument.setting.quoteParam.qtype: unsupported value 9'
        );
    });

    it('throws the server message for business errors returned with HTTP 200', () => {
        const response = axiosResponse<ApiEnvelope<null>>({ code: 12000003, msg: 'invalid size format', data: null });

        expect(() => getApiData(response)).toThrow(SynfError);
        expect(() => getApiData(response)).toThrow('invalid size format');
    });

    it('decodes quotation fields through a typed endpoint decoder', () => {
        const quotation = decodeQuotation(createInquirePayload({ tick: '12', postTick: '13' }));

        expect(quotation).toMatchObject({
            benchmark: 100n,
            sqrtFairPX96: 200n,
            tick: 12,
            mark: 300n,
            entryNotional: 400n,
            fee: 5n,
            minAmount: 6n,
            sqrtPostFairPX96: 700n,
            postTick: 13,
        });
    });

    it('requires size for by-tick quotation decoding', () => {
        expect(() => decodeQuotationWithSize(createInquirePayload())).toThrow('Invalid size: expected integer string');
    });

    it('decodes and sorts order book steps', () => {
        const decoded = decodeOrderBookSteps({
            '0.01': {
                bids: [
                    { tick: 1, baseSize: '10', baseSum: '10', quoteSize: '20', quoteSum: '20', price: '2' },
                    { tick: 3, baseSize: '30', baseSum: '40', quoteSize: '60', quoteSum: '80', price: '4' },
                ],
                asks: [
                    { tick: 5, baseSize: '50', baseSum: '50', quoteSize: '100', quoteSum: '100', price: '10' },
                    { tick: 4, baseSize: '40', baseSum: '90', quoteSize: '80', quoteSum: '180', price: '8' },
                ],
            },
        });

        expect(decoded['0.01']?.bids.map((entry) => entry.tick)).toEqual([3, 1]);
        expect(decoded['0.01']?.asks.map((entry) => entry.tick)).toEqual([4, 5]);
        expect(decoded['0.01']?.bids[0]?.baseQuantity).toBe(30n);
        expect(decoded['0.01']?.asks[0]?.quoteSum).toBe(180n);
    });

    it('decodes null order book sides from the server as empty levels', () => {
        // Shape captured from the Base public API: an empty side is serialized as `null`.
        expect(decodeOrderBookSteps({ '10': { bids: null, asks: null } })).toEqual({ '10': { bids: [], asks: [] } });
    });

    it('decodes MM wallet balances and positions without module-level casts', () => {
        const wallet = decodeMmWalletBalance({
            address: '0x0000000000000000000000000000000000000001',
            isBlacklisted: false,
            pendingDuration: '9',
            portfolios: [
                {
                    quote: '0x0000000000000000000000000000000000000002',
                    decimals: 18,
                    balance: '100',
                    pendingBalance: { timestamp: 1, native: false, amount: '2', exemption: '3' },
                    totalInBalance: '200',
                    totalOutBalance: '50',
                    reservedBalance: '10',
                    thresholdBalance: '5',
                    maxWithdrawable: '95',
                    symbol: 'USDC',
                },
            ],
        });
        const positions = decodeMmPositionList([
            {
                balance: '100',
                size: '-2',
                entryNotional: '90',
                entrySocialLossIndex: '1',
                entryFundingIndex: '2',
                side: 1,
                entryPrice: '45',
                lastUpdateTime: 10,
                lastUpdateTxHash: '0xabc',
                instrumentAddr: '0x0000000000000000000000000000000000000003',
                expiry: 100,
                symbol: 'BTC-USDC',
            },
        ]);

        expect(wallet.pendingDuration).toBe(9n);
        expect(wallet.portfolios[0]?.balance).toBe(100n);
        expect(wallet.portfolios[0]?.pendingBalance.amount).toBe(2n);
        expect(positions[0]?.size).toBe(-2n);
        expect(positions[0]?.entryFundingIndex).toBe(2n);
    });

    it('decodes portfolio and gate balance payloads through endpoint decoders', () => {
        const portfolio = decodePortfolioList({
            address: '0x0000000000000000000000000000000000000001',
            instruments: [],
            portfolios: [
                {
                    blockInfo: { timestamp: 1, height: 2 },
                    instrumentAddr: '0x0000000000000000000000000000000000000002',
                    traderAddr: '0x0000000000000000000000000000000000000003',
                    expiry: 100,
                    position: {
                        balance: '10',
                        size: '-2',
                        entryNotional: '30',
                        entrySocialLossIndex: '0',
                        entryFundingIndex: '4',
                        entryPrice: '15',
                        side: 1,
                    },
                    orders: [
                        {
                            tick: 1,
                            nonce: 2,
                            oid: 3,
                            balance: '3',
                            size: '4',
                            side: 2,
                            taken: '5',
                            limitPrice: '6',
                        },
                    ],
                    ranges: [
                        {
                            tickLower: 1,
                            tickUpper: 2,
                            liquidity: '7',
                            sqrtEntryPX96: '8',
                            entryFeeIndex: '9',
                            balance: '10',
                            entryPrice: '11',
                            expiry: 100,
                            instrumentAddr: '0x0000000000000000000000000000000000000002',
                            lowerPrice: '12',
                            rid: 4,
                            traderAddr: '0x0000000000000000000000000000000000000003',
                            upperPrice: '13',
                        },
                    ],
                },
            ],
        });
        const gateBalances = decodeGateBalances([
            {
                quote: '0x0000000000000000000000000000000000000004',
                decimals: 18,
                balance: '100',
                pendingBalance: { amount: '2', exemption: '3' },
                totalInBalance: '200',
                totalOutBalance: '50',
            },
        ]);

        expect(portfolio.portfolios[0]?.position?.balance).toBe(10n);
        expect(portfolio.portfolios[0]?.orders[0]?.limitPrice).toBe(6n);
        expect(gateBalances?.[0]?.balance).toBe(100n);
        expect(gateBalances?.[0]?.pendingBalance.amount).toBe(2n);
    });

    it('decodes portfolio lists the server leaves empty', () => {
        // Shapes from the Base public API: nil Go slices arrive as `null`, and a missing position as the
        // zero-valued struct.
        expect(
            decodePortfolioList({
                address: '0x0000000000000000000000000000000000000001',
                instruments: null,
                portfolios: null,
            })
        ).toEqual({ address: '0x0000000000000000000000000000000000000001', instruments: [], portfolios: [] });

        const portfolio = decodePortfolioList({
            address: '0x0000000000000000000000000000000000000001',
            instruments: [],
            portfolios: [
                {
                    blockInfo: { timestamp: 1, height: 2 },
                    instrumentAddr: '0x0000000000000000000000000000000000000002',
                    traderAddr: '0x0000000000000000000000000000000000000003',
                    expiry: 100,
                    position: {
                        balance: '',
                        size: '',
                        entryNotional: '',
                        entrySocialLossIndex: '',
                        entryFundingIndex: '',
                        side: 0,
                        entryPrice: '',
                        lastUpdateTime: 0,
                        lastUpdateTxHash: '',
                    },
                    orders: [],
                    ranges: [],
                },
            ],
        });
        expect(portfolio.portfolios[0]?.position).toBeUndefined();
    });

    it('decodes depth chart liquidity details and normalizes tick pearls', () => {
        const details = decodeDepthChartLiquidityDetails({
            amm: {
                liquidity: '100',
                sqrtPX96: '200',
                tick: 1,
            },
            blockInfo: { timestamp: 1, height: 2 },
            length: 1,
            pearls: [],
            size: 10,
            stepRatio: 1,
            tick2Pearl: {
                '3': ['40', '50'],
            },
            tickDelta: 1,
            tids: [3],
        });

        expect(details.amm.liquidity).toBe(100n);
        expect(details.tick2Pearl.get(3)).toEqual({ liquidityNet: 40n, left: 50n });
    });
});

function pascalCase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(pascalCase);
    if (value !== null && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key[0].toUpperCase() + key.slice(1), pascalCase(item)])
        );
    return value;
}

describe('PascalCase on-chain query decoding', () => {
    test('preserves valid zeros and snapshot values', () => {
        const snapshot = buildOnChainContextFromQuery(pascalCase(fixture.context));
        expect(snapshot.amm.liquidity).toBe(BigInt(fixture.context.amm.liquidity));
        expect(snapshot.instrumentSetting.fundingHour).toBe(0);
        expect(snapshot.portfolio.position.size).toBe(0n);
    });
    test('rejects empty nested structures at the HTTP boundary', async () => {
        const market = createMarketModule({ Setting: {}, Amm: {}, PriceData: {}, Spacing: {}, BlockInfo: {} });
        await expect(
            market.fetchMarketOnChainContextQuery({
                chainId: 8453,
                instrument: '0x0000000000000000000000000000000000001000',
                expiry: 1,
            })
        ).rejects.toThrow('Setting.Param');
    });
    test('keeps on-chain integers that the server sends as unsafe JSON numbers', async () => {
        // The live endpoint writes raw uint256 values such as SqrtPX96 as JSON numbers, not strings.
        const text = JSON.stringify({ code: 0, msg: '', data: pascalCase(fixture.context) }).replace(
            /"(\d{16,})"/g,
            '$1'
        );
        const httpClient = new HttpClient();
        jest.spyOn(httpClient, 'get').mockImplementation(async (_url, config) => {
            const transform = config?.transformResponse;
            if (!config || typeof transform !== 'function') throw new Error('expected a response transform');
            return axiosResponse(transform.call({ ...config, headers: new AxiosHeaders() }, text, new AxiosHeaders()));
        });
        const market = new MarketModule(httpClient, signer);

        const snapshot = await market.fetchMarketOnChainContextQuery({
            chainId: 8453,
            instrument: fixture.instrumentAddress as Address,
            expiry: fixture.context.amm.expiry,
        });

        expect(BigInt(fixture.context.amm.sqrtPX96) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
        expect(snapshot?.amm.sqrtPX96).toBe(BigInt(fixture.context.amm.sqrtPX96));
        expect(snapshot?.amm.liquidity).toBe(BigInt(fixture.context.amm.liquidity));
    });
    test('parses JSON with exact large integers and ordinary numbers', () => {
        expect(parseJsonPreservingLargeIntegers('{"a":948762293131447213047873171696,"b":0.5,"c":7}')).toEqual({
            a: '948762293131447213047873171696',
            b: 0.5,
            c: 7,
        });
    });
    test.each([false, 0, 'invalid'])('rejects malformed optional portfolio %s', (Portfolio) => {
        const raw = pascalCase(fixture.context) as Record<string, unknown>;
        expect(() => buildOnChainContextFromQuery({ ...raw, Portfolio })).toThrow('Portfolio');
    });
    test.each([null, undefined, '', 'broken', '1.5', '1e-1', '1e999999999', 1.5, Number.MAX_SAFE_INTEGER + 1])(
        'rejects invalid integer %s',
        (value) => {
            expect(() => toBigIntValue(value)).toThrow('Invalid bigint');
        }
    );
    test.each([
        ['0', 0n],
        ['1.2e3', 1200n],
        ['-12.00', -12n],
        ['0e-5', 0n],
    ] as const)('preserves exact integer %s', (value, expected) => {
        expect(toBigIntValue(value)).toBe(expected);
    });
});

describe('API request contracts', () => {
    const instrument = '0x0000000000000000000000000000000000000001';

    function requestedUrls(payload: unknown): { httpClient: HttpClient; urls: () => string[] } {
        const httpClient = new HttpClient();
        const get = jest.spyOn(httpClient, 'get').mockResolvedValue(apiEnvelopeResponse(payload));
        return { httpClient, urls: () => get.mock.calls.map(([url]) => url) };
    }

    test('sends the parameter names the public API validates', async () => {
        const { httpClient, urls } = requestedUrls(null);
        const market = new MarketModule(httpClient, signer);
        await market.fetchMarketPairInfo({ chainId: 8453, address: instrument, expiry: 4294967295 });
        await market.fetchFuturesPairKlineChart({
            chainId: 8453,
            instrument,
            expiry: 4294967295,
            interval: KlineInterval.HOUR,
            endTime: 1_790_000_000,
        });
        await new PublicModule(httpClient, signer).fetchPortfolioList({ chainId: 8453, userAddress: instrument });

        expect(urls()).toEqual([
            `/v4/public/market/marketPairInfo?chainId=8453&expiry=4294967295&instrument=${instrument}`,
            `/v4/public/market/kline?chainId=8453&endTime=1790000000&expiry=4294967295&instrument=${instrument}&interval=1h&limit=1000`,
            `/v4/public/market/portfolio?chainId=8453&userAddress=${instrument}`,
        ]);
    });

    test('validates closed history enums and keeps observed server values', async () => {
        // typeString and side values observed on the Base mainnet history API.
        const trade = { id: '1', timestamp: 2, typeString: 'Market', side: 'long' };
        const limit = { id: '2', timestamp: 3, typeString: 'Limit', side: 'short' };
        const { httpClient } = requestedUrls({ list: [trade, limit] });
        const history = new HistoryModule(httpClient, signer);

        await expect(history.fetchTradeHistory({ chainId: 8453, userAddress: instrument })).resolves.toEqual([
            limit,
            trade,
        ]);

        jest.spyOn(httpClient, 'get').mockResolvedValue(
            apiEnvelopeResponse({ list: [trade, { ...trade, typeString: 'market' }] })
        );
        await expect(history.fetchTradeHistory({ chainId: 8453, userAddress: instrument })).rejects.toThrow(
            'Invalid tradeHistory.list[1].typeString: unsupported value market'
        );
    });
});
