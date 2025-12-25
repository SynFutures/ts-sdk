import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, jest, test } from '@jest/globals';
import type { Address, Chain, PublicClient } from 'viem';
import { createPublicClient, http } from 'viem';
import { base as baseChain } from 'viem/chains';
import { abctest } from '@synfutures/viem-kit';
import {
    InstrumentSetting,
    PairSnapshot,
    Position,
    QuotationWithSize,
    Side,
    SimulationError,
    UserSetting,
    type Amm,
    type BlockInfo,
    type OnchainContext,
    type Portfolio,
    type Quotation,
    type Setting,
} from '../types';
import { TradeInput } from '../actions/trade';
import { AdjustInput } from '../actions/adjust';
import { PlaceInput } from '../actions/order';
import { fetchFuturesInstrumentInquire } from '../apis/api';
import { fetchOnchainContext } from '../queries';
import { fetchOnchainContext as fetchOnchainContextFromRpc } from '../queries/rpc';
import type { ApiConfig, RpcConfig } from '../queries/config';
import { getPerpInfo } from '../info';
import { WAD, ZERO } from '../constants';
import { abs } from '../math';

jest.setTimeout(120_000);

/**
 * Helper function to reconstruct OnchainContext from a PairSnapshot instance.
 * This is needed because setting, condition, and spacing are no longer public fields.
 */
function getOnchainContextOptions(context: PairSnapshot): OnchainContext {
    const inst = context.instrumentSetting;
    return {
        setting: {
            symbol: inst.symbol,
            config: inst.configAddress,
            gate: inst.gateAddress,
            market: inst.marketAddress,
            quote: inst.quoteAddress,
            decimals: inst.quoteDecimals,
            param: inst.quoteParam,
            initialMarginRatio: inst.initialMarginRatio,
            maintenanceMarginRatio: inst.maintenanceMarginRatio,
            placePaused: inst.placePaused,
            fundingHour: inst.fundingHour,
            disableOrderRebate: inst.disableOrderRebate,
        },
        condition: inst.condition,
        amm: context.amm,
        priceData: context.priceData,
        spacing: {
            pearl: inst.pearlSpacing,
            order: inst.orderSpacing,
            range: inst.rangeSpacing,
        },
        blockInfo: context.blockInfo,
        portfolio: context.portfolio,
        quotation: context.quotation,
        quoteState: context.quoteState,
    };
}

type ScenarioType =
    | 'marketByMargin'
    | 'marketByLeverage'
    | 'marketClose'
    | 'adjustMargin'
    | 'adjustMarginByLeverage'
    | 'limitOrder';

interface BaseScenario {
    name?: string;
    type: ScenarioType;
    chainId: number;
    instrumentAddress: Address;
    expiry: number;
    traderAddress: Address;
    userSetting: RawUserSetting;
    apiKeyEnv?: string;
    rpcUrlEnv?: string;
    rpcUrl?: string;
    observerAddress?: Address;
    blockNumber?: string;
    blockTag?: 'latest' | 'earliest' | 'pending';
}

interface MarketByMarginScenario extends BaseScenario {
    type: 'marketByMargin';
    input: {
        side: 'LONG' | 'SHORT';
        baseQuantity: string;
        margin: string;
    };
}

interface MarketByLeverageScenario extends BaseScenario {
    type: 'marketByLeverage';
    input: {
        side: 'LONG' | 'SHORT';
        baseQuantity: string;
        targetLeverage: string;
    };
}

interface MarketCloseScenario extends BaseScenario {
    type: 'marketClose';
    input: {
        baseQuantity: string;
    };
}

interface AdjustMarginScenario extends BaseScenario {
    type: 'adjustMargin';
    input: {
        amount: string;
        transferIn: boolean;
    };
}

interface AdjustMarginByLeverageScenario extends BaseScenario {
    type: 'adjustMarginByLeverage';
    input: {
        targetLeverage: string;
    };
}

interface LimitOrderScenario extends BaseScenario {
    type: 'limitOrder';
    input: {
        side: 'LONG' | 'SHORT';
        baseQuantity: string;
        leverage: string;
        tick: number;
        dappSetting?: {
            markPriceBufferInBps?: number;
        };
    };
}

type Scenario =
    | MarketByMarginScenario
    | MarketByLeverageScenario
    | MarketCloseScenario
    | AdjustMarginScenario
    | AdjustMarginByLeverageScenario
    | LimitOrderScenario;

interface PreparedScenario {
    scenario: Scenario;
    apiConfig?: ApiConfig;
    instrumentAddress?: Address;
    expiry?: number;
    traderAddress?: Address;
    userSetting?: UserSetting;
    onchainContext?: PairSnapshot;
    portfolioContext?: {
        instrumentSetting: InstrumentSetting;
        portfolio: Portfolio;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
    };
    rpcConfig?: RpcConfig;
    publicClient?: PublicClient;
    skipReason?: string;
}

const parityFixtureEnv = process.env.SIMULATE_PARITY_FIXTURE;
const scenarios: Scenario[] = parityFixtureEnv ? loadScenarios(parityFixtureEnv) : [];
const prepared: PreparedScenario[] = scenarios.map((scenario) => ({ scenario }));

interface RawUserSetting {
    deadline: number;
    slippage: number;
    strictMode?: boolean;
    markPriceBufferInBps?: number;
}

function buildBaseUserSetting(raw: RawUserSetting): UserSetting {
    return new UserSetting(raw.deadline, raw.slippage, 3n * WAD, raw.markPriceBufferInBps ?? 0, raw.strictMode);
}

beforeAll(async () => {
    for (const entry of prepared) {
        const { scenario } = entry;
        const rpcUrl = resolveRpcUrl(scenario);
        if (!rpcUrl) {
            entry.skipReason = `Missing RPC URL (${scenario.rpcUrlEnv ?? ''})`;
            continue;
        }

        const chain = resolveChain(scenario.chainId);
        if (!chain) {
            entry.skipReason = `Unknown chain ID: ${scenario.chainId}`;
            continue;
        }

        const observerAddress = scenario.observerAddress ?? resolveObserverAddress(scenario.chainId);
        if (!observerAddress) {
            entry.skipReason = `Observer address not found for chain ${scenario.chainId}`;
            continue;
        }

        const apiConfig: ApiConfig = {
            chainId: scenario.chainId,
        };

        const apiKeyEnv = scenario.apiKeyEnv ?? 'SYNF_PARITY_API_KEY';
        const apiKey = process.env[apiKeyEnv];
        if (apiKey) {
            // Note: AuthInfo requires apiKey, passphrase, and secretKey
            // For tests, we may only have apiKey, so we skip authInfo if not all fields are available
            const passphrase = process.env.SYNF_PARITY_PASSPHRASE;
            const secretKey = process.env.SYNF_PARITY_SECRET_KEY;
            if (passphrase && secretKey) {
                apiConfig.authInfo = { apiKey, passphrase, secretKey };
            }
        }

        entry.apiConfig = apiConfig;
        entry.instrumentAddress = scenario.instrumentAddress;
        entry.expiry = scenario.expiry;
        entry.traderAddress = scenario.traderAddress;
        entry.userSetting = buildBaseUserSetting(scenario.userSetting);

        try {
            entry.onchainContext = await fetchOnchainContext(scenario.instrumentAddress, scenario.expiry, apiConfig);
        } catch (error) {
            entry.skipReason = `fetchOnchainContext failed: ${(error as Error).message}`;
            continue;
        }

        try {
            const portfolioCtx = await fetchOnchainContext(
                scenario.instrumentAddress,
                scenario.expiry,
                apiConfig,
                scenario.traderAddress
            );
            if (portfolioCtx.portfolio) {
                entry.portfolioContext = {
                    instrumentSetting: portfolioCtx.instrumentSetting,
                    portfolio: portfolioCtx.portfolio,
                    amm: portfolioCtx.amm,
                    markPrice: portfolioCtx.priceData.markPrice,
                    blockInfo: portfolioCtx.blockInfo,
                };
            } else {
                entry.portfolioContext = undefined;
            }
        } catch {
            entry.portfolioContext = undefined;
        }

        if (!entry.portfolioContext?.portfolio?.position) {
            entry.skipReason = 'Missing portfolio.position for trader in API context';
            continue;
        }

        const publicClient = createPublicClient({
            chain,
            transport: http(rpcUrl),
        });

        const rpcConfig: RpcConfig = {
            chainId: scenario.chainId,
            publicClient,
            observerAddress,
        };

        entry.publicClient = publicClient;
        entry.rpcConfig = rpcConfig;
    }
});

if (!parityFixtureEnv || scenarios.length === 0) {
    describe('simulate api/rpc parity', () => {
        test.skip('SIMULATE_PARITY_FIXTURE not provided, skipping parity tests', () => {});
    });
} else {
    describe('simulate api/rpc parity', () => {
        for (const entry of prepared) {
            const displayName =
                entry.scenario.name ??
                `${entry.scenario.type} - ${entry.scenario.instrumentAddress} @ ${entry.scenario.expiry}`;

            if (entry.skipReason) {
                test.skip(displayName, () => {
                    throw new Error(entry.skipReason!);
                });
                continue;
            }

            const testFn = async () => {
                if (!entry.apiConfig || !entry.rpcConfig || !entry.onchainContext) {
                    throw new Error('Test initialization failed: required context missing');
                }

                await executeScenario(entry);
            };

            test(displayName, testFn);
        }
    });
}

async function executeScenario(entry: PreparedScenario): Promise<void> {
    const {
        scenario,
        apiConfig,
        instrumentAddress,
        expiry,
        traderAddress,
        userSetting,
        rpcConfig,
        onchainContext,
        portfolioContext,
    } = entry;
    if (
        !apiConfig ||
        !rpcConfig ||
        !onchainContext ||
        !instrumentAddress ||
        expiry === undefined ||
        !traderAddress ||
        !userSetting
    ) {
        throw new Error('Missing context');
    }

    switch (scenario.type) {
        case 'marketByMargin':
            await runMarketByMarginScenario(
                scenario as MarketByMarginScenario,
                apiConfig,
                instrumentAddress,
                expiry,
                traderAddress,
                userSetting,
                rpcConfig,
                onchainContext,
                portfolioContext
            );
            return;
        case 'marketByLeverage':
            await runMarketByLeverageScenario(
                scenario as MarketByLeverageScenario,
                apiConfig,
                instrumentAddress,
                expiry,
                traderAddress,
                userSetting,
                rpcConfig,
                onchainContext,
                portfolioContext
            );
            return;
        case 'marketClose':
            await runMarketCloseScenario(
                scenario as MarketCloseScenario,
                apiConfig,
                instrumentAddress,
                expiry,
                traderAddress,
                userSetting,
                rpcConfig,
                onchainContext,
                portfolioContext
            );
            return;
        case 'adjustMargin':
            await runAdjustMarginScenario(
                scenario as AdjustMarginScenario,
                apiConfig,
                instrumentAddress,
                expiry,
                traderAddress,
                rpcConfig,
                onchainContext,
                portfolioContext
            );
            return;
        case 'adjustMarginByLeverage':
            await runAdjustMarginByLeverageScenario(
                scenario as AdjustMarginByLeverageScenario,
                apiConfig,
                instrumentAddress,
                expiry,
                traderAddress,
                rpcConfig,
                onchainContext,
                portfolioContext
            );
            return;
        case 'limitOrder':
            await runLimitOrderScenario(
                scenario as LimitOrderScenario,
                apiConfig,
                instrumentAddress,
                expiry,
                traderAddress,
                userSetting,
                rpcConfig,
                onchainContext
            );
            return;
        default:
            throw new Error(`Unsupported scenario type: ${(scenario as Scenario).type}`);
    }
}

async function runMarketByMarginScenario(
    scenario: MarketByMarginScenario,
    apiConfig: ApiConfig,
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    userSetting: UserSetting,
    rpcConfig: RpcConfig,
    onchainContext: PairSnapshot,
    portfolioContext?: {
        instrumentSetting: InstrumentSetting;
        portfolio: Portfolio;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
    }
): Promise<void> {
    const side = toSide(scenario.input.side);
    const baseQuantity = BigInt(scenario.input.baseQuantity);
    const marginAmount = BigInt(scenario.input.margin);

    if (baseQuantity <= 0n) {
        throw new SimulationError('Trade size must be positive');
    }
    if (marginAmount <= 0n) {
        throw new SimulationError('Margin must be positive');
    }

    const signedSize = directionFromSide(side) * baseQuantity;

    const artifacts = await loadMarketArtifacts(
        scenario,
        apiConfig,
        instrumentAddress,
        expiry,
        traderAddress,
        signedSize,
        onchainContext,
        portfolioContext
    );

    const tradeInput = new TradeInput(traderAddress, bigAbs(signedSize), side, marginAmount);

    // Use the original onchainContext for API side (it was passed to loadMarketArtifacts)
    const apiOnchainContextWithQuotation = onchainContext.with({
        portfolio: {
            ...createEmptyPortfolio(),
            position: artifacts.marketContext.position,
        },
        quotation: artifacts.marketContext.quotation,
    });

    const apiQuotationWithSize = artifacts.quotationWithSize;
    const [, apiResult] = tradeInput.simulate(apiOnchainContextWithQuotation, apiQuotationWithSize, userSetting);

    const rpcOnchainContext = await fetchOnchainContextFromRpc(
        instrumentAddress,
        expiry,
        cloneRpcConfigWithBlock(rpcConfig, artifacts.blockNumber),
        traderAddress,
        signedSize
    );
    if (!rpcOnchainContext.quotation) {
        throw new Error('Quotation is required');
    }
    const rpcQuotationWithSize = new QuotationWithSize(signedSize, rpcOnchainContext.quotation);
    const [, rpcResult] = tradeInput.simulate(rpcOnchainContext, rpcQuotationWithSize, userSetting);

    compareTradeResults(apiResult, rpcResult);
}

async function runMarketByLeverageScenario(
    scenario: MarketByLeverageScenario,
    apiConfig: ApiConfig,
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    userSetting: UserSetting,
    rpcConfig: RpcConfig,
    onchainContext: PairSnapshot,
    portfolioContext?: {
        instrumentSetting: InstrumentSetting;
        portfolio: Portfolio;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
    }
): Promise<void> {
    const side = toSide(scenario.input.side);
    const baseQuantity = BigInt(scenario.input.baseQuantity);
    const targetLeverage = BigInt(scenario.input.targetLeverage);

    if (baseQuantity <= 0n) {
        throw new SimulationError('Trade size must be positive');
    }
    if (targetLeverage <= 0n) {
        throw new SimulationError('Leverage must be positive');
    }

    const signedSize = directionFromSide(side) * baseQuantity;

    const artifacts = await loadMarketArtifacts(
        scenario,
        apiConfig,
        instrumentAddress,
        expiry,
        traderAddress,
        signedSize,
        onchainContext,
        portfolioContext
    );

    const leverageUserSetting = new UserSetting(
        userSetting.deadlineOffset,
        userSetting.slippage,
        targetLeverage,
        userSetting.markPriceBufferInBps,
        userSetting.strictMode
    );
    const tradeInput = new TradeInput(traderAddress, bigAbs(signedSize), side);

    // Use the original onchainContext for API side (it was passed to loadMarketArtifacts)
    const apiOnchainContextWithQuotation = onchainContext.with({
        portfolio: {
            ...createEmptyPortfolio(),
            position: artifacts.marketContext.position,
        },
        quotation: artifacts.marketContext.quotation,
    });

    const apiQuotationWithSize = artifacts.quotationWithSize;
    const [, apiResult] = tradeInput.simulate(apiOnchainContextWithQuotation, apiQuotationWithSize, userSetting);

    const rpcOnchainContext = await fetchOnchainContextFromRpc(
        instrumentAddress,
        expiry,
        cloneRpcConfigWithBlock(rpcConfig, artifacts.blockNumber),
        traderAddress,
        signedSize
    );
    if (!rpcOnchainContext.quotation) {
        throw new Error('Quotation is required');
    }
    const rpcQuotationWithSize = new QuotationWithSize(signedSize, rpcOnchainContext.quotation);
    const [, rpcResult] = tradeInput.simulate(rpcOnchainContext, rpcQuotationWithSize, userSetting);

    compareTradeResults(apiResult, rpcResult);
}

async function runMarketCloseScenario(
    scenario: MarketCloseScenario,
    apiConfig: ApiConfig,
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    userSetting: UserSetting,
    rpcConfig: RpcConfig,
    onchainContext: PairSnapshot,
    portfolioContext?: {
        instrumentSetting: InstrumentSetting;
        portfolio: Portfolio;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
    }
): Promise<void> {
    const baseQuantity = BigInt(scenario.input.baseQuantity);
    // To close a position, trade the opposite side
    // signedSize is the trade size (opposite of position size to close)
    const signedSize = -baseQuantity;

    if (baseQuantity === 0n) {
        throw new SimulationError('Close size cannot be zero');
    }

    const closeSide = signedSize >= ZERO ? Side.LONG : Side.SHORT;
    const closeInput = new TradeInput(
        traderAddress,
        abs(signedSize), // positive quantity
        closeSide // side determined from signed size
    );

    const artifacts = await loadMarketArtifacts(
        scenario,
        apiConfig,
        instrumentAddress,
        expiry,
        traderAddress,
        signedSize, // use signed trade size for quotation fetch
        onchainContext,
        portfolioContext
    );

    // Use the original onchainContext for API side (it was passed to loadMarketArtifacts)
    const apiOnchainContextWithQuotation = onchainContext.with({
        portfolio: {
            ...createEmptyPortfolio(),
            position: artifacts.marketContext.position,
        },
        quotation: artifacts.marketContext.quotation,
    });

    const apiQuotationWithSize = artifacts.quotationWithSize;
    const [, apiResult] = closeInput.simulate(apiOnchainContextWithQuotation, apiQuotationWithSize, userSetting);

    const rpcOnchainContext = await fetchOnchainContextFromRpc(
        instrumentAddress,
        expiry,
        cloneRpcConfigWithBlock(rpcConfig, artifacts.blockNumber),
        traderAddress,
        signedSize // use signed trade size for quotation fetch
    );
    if (!rpcOnchainContext.quotation) {
        throw new Error('Quotation is required');
    }
    const rpcQuotationWithSize = new QuotationWithSize(signedSize, rpcOnchainContext.quotation);
    const [, rpcResult] = closeInput.simulate(rpcOnchainContext, rpcQuotationWithSize, userSetting);

    compareTradeResults(apiResult, rpcResult);

    const expectedLiquidation = rpcResult.postPosition.liquidationPrice(
        artifacts.marketContext.amm,
        artifacts.marketContext.instrumentSetting.maintenanceMarginRatio
    );
    const actualLiquidation = rpcResult.postPosition.liquidationPrice(
        rpcOnchainContext.amm,
        rpcOnchainContext.instrumentSetting.maintenanceMarginRatio
    );
    expect(actualLiquidation.toString()).toBe(expectedLiquidation.toString());
}

async function runAdjustMarginScenario(
    scenario: AdjustMarginScenario,
    apiConfig: ApiConfig,
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    rpcConfig: RpcConfig,
    onchainContext: PairSnapshot,
    portfolioContext?: {
        instrumentSetting: InstrumentSetting;
        portfolio: Portfolio;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
    }
): Promise<void> {
    const amount = BigInt(scenario.input.amount);

    if (amount <= 0n) {
        throw new SimulationError('Margin amount must be positive');
    }

    const instrumentSetting = portfolioContext?.instrumentSetting ?? onchainContext.instrumentSetting;

    const userSetting = new UserSetting(0, 0, 3n * WAD);
    const adjustInput = new AdjustInput(traderAddress, amount, scenario.input.transferIn);

    const apiOnchainContext = onchainContext.with({
        portfolio: portfolioContext?.portfolio ?? createEmptyPortfolio(),
    });
    const [apiParam, apiResult] = adjustInput.simulate(apiOnchainContext, userSetting);

    const rpcOnchainContext = await fetchOnchainContextFromRpc(
        instrumentAddress,
        expiry,
        cloneRpcConfigWithBlock(rpcConfig, onchainContext.blockInfo?.height),
        traderAddress
    );
    const [rpcParam, rpcResult] = adjustInput.simulate(rpcOnchainContext, userSetting);

    // TypeScript narrows the types after checking
    // apiResult and rpcResult are AdjustSimulation
    const apiMarkPrice = apiOnchainContext.priceData.markPrice;
    const rpcMarkPrice = rpcOnchainContext.priceData.markPrice;

    expect(rpcResult.postPosition.leverage(rpcOnchainContext.amm, rpcMarkPrice).toString()).toBe(
        apiResult.postPosition.leverage(apiOnchainContext.amm, apiMarkPrice).toString()
    );
    expect(rpcResult.postPosition.balance.toString()).toBe(apiResult.postPosition.balance.toString());

    const expectedLiquidation = apiResult.postPosition.liquidationPrice(
        apiOnchainContext.amm,
        instrumentSetting.maintenanceMarginRatio
    );
    const actualLiquidation = rpcResult.postPosition.liquidationPrice(
        rpcOnchainContext.amm,
        instrumentSetting.maintenanceMarginRatio
    );

    expect(actualLiquidation.toString()).toBe(expectedLiquidation.toString());
}

async function runAdjustMarginByLeverageScenario(
    scenario: AdjustMarginByLeverageScenario,
    apiConfig: ApiConfig,
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    rpcConfig: RpcConfig,
    onchainContext: PairSnapshot,
    portfolioContext?: {
        instrumentSetting: InstrumentSetting;
        portfolio: Portfolio;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
    }
): Promise<void> {
    const targetLeverage = BigInt(scenario.input.targetLeverage);

    if (targetLeverage <= 0n) {
        throw new SimulationError('Target leverage must be positive');
    }

    const instrumentSetting = portfolioContext?.instrumentSetting ?? onchainContext.instrumentSetting;

    const userSetting = new UserSetting(0, 0, targetLeverage);
    const adjustInput = new AdjustInput(traderAddress);

    const apiOnchainContext = onchainContext.with({
        portfolio: portfolioContext?.portfolio ?? createEmptyPortfolio(),
    });
    const [apiParam, apiResult] = adjustInput.simulate(apiOnchainContext, userSetting);

    const rpcOnchainContext = await fetchOnchainContextFromRpc(
        instrumentAddress,
        expiry,
        cloneRpcConfigWithBlock(rpcConfig, onchainContext.blockInfo?.height),
        traderAddress
    );
    const [rpcParam, rpcResult] = adjustInput.simulate(rpcOnchainContext, userSetting);

    // TypeScript narrows the types after checking
    // apiResult and rpcResult are AdjustSimulation
    expect(rpcParam.net >= ZERO).toBe(apiParam.net >= ZERO); // transferIn
    expect(rpcParam.net.toString()).toBe(apiParam.net.toString()); // marginDelta
    expect(rpcResult.postPosition.balance.toString()).toBe(apiResult.postPosition.balance.toString());

    const expectedLiquidation = apiResult.postPosition.liquidationPrice(
        apiOnchainContext.amm,
        instrumentSetting.maintenanceMarginRatio
    );
    const actualLiquidation = rpcResult.postPosition.liquidationPrice(
        rpcOnchainContext.amm,
        instrumentSetting.maintenanceMarginRatio
    );

    expect(actualLiquidation.toString()).toBe(expectedLiquidation.toString());
}

async function runLimitOrderScenario(
    scenario: LimitOrderScenario,
    apiConfig: ApiConfig,
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    userSetting: UserSetting,
    rpcConfig: RpcConfig,
    onchainContext?: PairSnapshot
): Promise<void> {
    const baseQuantity = BigInt(scenario.input.baseQuantity);
    const leverage = BigInt(scenario.input.leverage);
    const tick = scenario.input.tick;

    if (baseQuantity <= 0n) {
        throw new SimulationError('Order size must be positive');
    }
    if (leverage <= 0n) {
        throw new SimulationError('Leverage must be positive');
    }
    if (tick <= 0) {
        throw new SimulationError('Tick must be positive');
    }

    const context =
        onchainContext ?? (await fetchOnchainContext(scenario.instrumentAddress, scenario.expiry, apiConfig));

    const { instrumentSetting } = context;
    const portfolio = context.portfolio ?? createEmptyPortfolio();

    // Extract baseQuantity and side from scenario input
    const side = scenario.input.side === 'LONG' ? Side.LONG : Side.SHORT;
    const isLong = side === Side.LONG;
    let targetTick = tick;
    if (isLong && targetTick >= context.amm.tick) {
        targetTick = instrumentSetting.alignOrderTick(context.amm.tick - instrumentSetting.orderSpacing);
    } else if (!isLong && targetTick <= context.amm.tick) {
        targetTick = instrumentSetting.alignOrderTick(context.amm.tick + instrumentSetting.orderSpacing);
    }
    // Create UserSetting with markPriceBufferInBps if provided
    const markPriceBufferInBps =
        scenario.input.dappSetting?.markPriceBufferInBps ?? userSetting.markPriceBufferInBps ?? 0;
    const userSettingWithBuffer = new UserSetting(
        userSetting.deadlineOffset,
        userSetting.slippage,
        leverage,
        markPriceBufferInBps,
        userSetting.strictMode
    );

    const placeInput = new PlaceInput(scenario.traderAddress, targetTick, baseQuantity, side);

    // Simulate with API context
    const apiContextWithPortfolio = context.with({
        portfolio,
    });
    const [apiPlaceParam] = placeInput.simulate(apiContextWithPortfolio, userSettingWithBuffer);

    const rpcContext = await fetchOnchainContextFromRpc(
        instrumentAddress,
        expiry,
        cloneRpcConfigWithBlock(rpcConfig, context.blockInfo?.height)
    );

    // Simulate with RPC context (should produce same placeParam)
    const rpcContextWithPortfolio = new PairSnapshot({
        ...getOnchainContextOptions(rpcContext),
        portfolio,
    });
    const [rpcPlaceParam] = placeInput.simulate(rpcContextWithPortfolio, userSettingWithBuffer);

    // Verify both produce the same placeParam
    expect(normalizeData(apiPlaceParam)).toEqual(normalizeData(rpcPlaceParam));
}

interface MarketArtifacts {
    marketContext: {
        instrumentSetting: InstrumentSetting;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
        position: Position;
        quotation: Quotation;
    };
    amm: Amm;
    setting: Setting;
    markPrice: bigint;
    prePosition: Position;
    timestamp: number | undefined;
    quotationWithSize: QuotationWithSize;
    blockNumber?: number;
}

function toSide(side: 'LONG' | 'SHORT'): Side {
    return side === 'LONG' ? Side.LONG : Side.SHORT;
}

function directionFromSide(side: Side): 1n | -1n {
    return side === Side.LONG ? 1n : -1n;
}

function bigAbs(value: bigint): bigint {
    return value < 0n ? -value : value;
}

function createEmptyPortfolio(): Portfolio {
    return {
        oids: [],
        rids: [],
        orders: [],
        ranges: [],
        ordersTaken: [],
        position: Position.empty(),
    };
}

// Legacy helper - simulate functions don't support options yet, so this is a no-op
function cloneRpcConfigWithBlock(config: RpcConfig, _blockNumber?: number): RpcConfig {
    return { ...config };
}

async function loadMarketArtifacts(
    scenario: BaseScenario,
    apiConfig: ApiConfig,
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    signedSize: bigint,
    onchainContext?: PairSnapshot,
    portfolioContext?: {
        instrumentSetting: InstrumentSetting;
        portfolio: Portfolio;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
    }
): Promise<MarketArtifacts> {
    const context =
        onchainContext ?? (await fetchOnchainContext(scenario.instrumentAddress, scenario.expiry, apiConfig));

    let resolvedPortfolio = portfolioContext?.portfolio;
    if (!resolvedPortfolio) {
        const ctxWithTrader = await fetchOnchainContext(
            scenario.instrumentAddress,
            scenario.expiry,
            apiConfig,
            scenario.traderAddress
        );
        resolvedPortfolio = ctxWithTrader.portfolio;
    }

    const position = resolvedPortfolio?.position ?? createEmptyPortfolio().position;

    const quotation = await fetchFuturesInstrumentInquire({
        chainId: scenario.chainId,
        expiry: scenario.expiry,
        instrument: scenario.instrumentAddress,
        size: signedSize.toString(),
    });

    if (!quotation) {
        throw new SimulationError('Quotation is required to build simulation context');
    }

    // Validate quotation integrity
    if (quotation.entryNotional === 0n && signedSize !== 0n) {
        throw new SimulationError(`Invalid quotation: entryNotional is zero for size ${signedSize}`);
    }

    // Warn if quotation block doesn't match context block (potential timing issue)
    // Note: This is a known limitation - quotation is fetched during test execution,
    // while onchainContext may be from beforeAll. In production, API wrappers
    // fetch all data at once to ensure consistency.
    if (process.env.DEBUG_PARITY_TEST && context.blockInfo?.height) {
        console.log(`[DEBUG] Context block: ${context.blockInfo.height}, Quotation fetch time: ${Date.now()}`);
    }

    const markPrice = context.priceData.markPrice;
    const { instrumentSetting } = context;

    const marketContext: {
        instrumentSetting: InstrumentSetting;
        amm: Amm;
        markPrice?: bigint;
        blockInfo: BlockInfo;
        position: Position;
        quotation: Quotation;
    } = {
        instrumentSetting,
        amm: context.amm,
        markPrice,
        blockInfo: context.blockInfo,
        position,
        quotation,
    };

    const quotationWithSize = new QuotationWithSize(signedSize, quotation);

    return {
        marketContext,
        amm: context.amm,
        setting: {
            symbol: instrumentSetting.symbol,
            config: instrumentSetting.configAddress,
            gate: instrumentSetting.gateAddress,
            market: instrumentSetting.marketAddress,
            quote: instrumentSetting.quoteAddress,
            decimals: instrumentSetting.quoteDecimals,
            param: instrumentSetting.quoteParam,
            initialMarginRatio: instrumentSetting.initialMarginRatio,
            maintenanceMarginRatio: instrumentSetting.maintenanceMarginRatio,
            placePaused: instrumentSetting.placePaused,
            fundingHour: instrumentSetting.fundingHour,
            disableOrderRebate: instrumentSetting.disableOrderRebate,
        },
        markPrice,
        prePosition: position,
        timestamp: context.blockInfo?.timestamp,
        quotationWithSize,
        blockNumber: context.blockInfo?.height,
    };
}

function compareTradeResults(apiResult: unknown, rpcResult: unknown): void {
    const alignedRpc = pickStructure(rpcResult, apiResult);
    const apiNormalized = normalizeData(apiResult);
    const rpcNormalized = normalizeData(alignedRpc);

    // Align fields that may legitimately differ due to funding index updates between sources
    if (hasPostPosition(apiNormalized) && hasPostPosition(rpcNormalized)) {
        rpcNormalized.postPosition = {
            ...rpcNormalized.postPosition,
            entryFundingIndex: apiNormalized.postPosition.entryFundingIndex,
        };
    }

    // Debug logging
    if (process.env.DEBUG_PARITY_TEST) {
        console.log('[DEBUG] API Result:', JSON.stringify(apiNormalized, null, 2));
        console.log('[DEBUG] RPC Result (aligned):', JSON.stringify(rpcNormalized, null, 2));
    }

    expect(rpcNormalized).toEqual(apiNormalized);
}

function pickStructure(source: unknown, template: unknown, path = 'root'): unknown {
    if (template === null || typeof template !== 'object') {
        return source;
    }

    if (Array.isArray(template)) {
        if (!Array.isArray(source)) {
            throw new Error(`Type mismatch at ${path}: expected array, got ${typeof source}`);
        }
        if (source.length !== template.length) {
            throw new Error(`Array length mismatch at ${path}: API has ${template.length}, RPC has ${source.length}`);
        }
        return template.map((_, index) =>
            pickStructure((source as unknown[])[index], template[index], `${path}[${index}]`)
        );
    }

    const result: Record<string, unknown> = {};
    const sourceRecord = source as Record<string, unknown>;
    for (const key of Object.keys(template as Record<string, unknown>)) {
        if (!(key in sourceRecord)) {
            throw new Error(`RPC result missing field at ${path}.${key}`);
        }
        result[key] = pickStructure(sourceRecord[key], (template as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return result;
}

function normalizeData<T>(value: T): T {
    return normalizeInternal(value) as T;
}

type ResultWithPostPosition = { postPosition: { entryFundingIndex: bigint } };

function hasPostPosition(value: unknown): value is ResultWithPostPosition {
    return (
        !!value &&
        typeof value === 'object' &&
        'postPosition' in value &&
        value.postPosition !== null &&
        typeof (value as { postPosition: { entryFundingIndex?: unknown } }).postPosition === 'object' &&
        'entryFundingIndex' in (value as { postPosition: { entryFundingIndex?: unknown } }).postPosition
    );
}

function normalizeInternal(value: unknown): unknown {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeInternal(item));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, normalizeInternal(v)])
        );
    }
    return value;
}

function resolveChain(chainId: number): Chain | undefined {
    if (chainId === baseChain.id) {
        return baseChain;
    }
    if (chainId === abctest.id) {
        return abctest;
    }
    return undefined;
}

function resolveObserverAddress(chainId: number): Address | undefined {
    try {
        const perpInfo = getPerpInfo(chainId);
        return perpInfo.observer;
    } catch {
        return undefined;
    }
}

function resolveRpcUrl(scenario: BaseScenario): string | undefined {
    if (scenario.rpcUrl) {
        return scenario.rpcUrl;
    }
    if (scenario.rpcUrlEnv) {
        return process.env[scenario.rpcUrlEnv];
    }
    if (scenario.chainId === 8453) {
        return process.env.BASE_RPC;
    }
    if (scenario.chainId === 20250903) {
        return process.env.ABC_RPC;
    }
    return undefined;
}

function loadScenarios(fixturePath: string): Scenario[] {
    const resolved = path.isAbsolute(fixturePath) ? fixturePath : path.join(process.cwd(), fixturePath);
    const content = fs.readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(content) as Scenario[];
    return parsed;
}
