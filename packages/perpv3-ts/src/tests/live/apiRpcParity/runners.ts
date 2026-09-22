import { expect } from '@jest/globals';
import type { Address } from 'viem';
import { AdjustInput } from '../../../actions/adjust';
import { PlaceInput } from '../../../actions/order';
import { TradeInput } from '../../../actions/trade';
import { WAD, ZERO } from '../../../constants';
import { abs } from '../../../math';
import { fetchOnchainContext } from '../../../queries';
import { createQueryMarketModule } from '../../../queries/api';
import type { ApiConfig, RpcConfig } from '../../../queries/config';
import { fetchOnchainContext as fetchOnchainContextFromRpc } from '../../../queries/rpc';
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
} from '../../../types';
import { compareTradeResults, normalizeData } from './assertions';
import { scenarioReadOptions } from './fixtures';
import type {
    AdjustMarginByLeverageScenario,
    AdjustMarginScenario,
    BaseScenario,
    LimitOrderScenario,
    MarketByLeverageScenario,
    MarketByMarginScenario,
    MarketCloseScenario,
    PortfolioContext,
    PreparedScenario,
} from './types';

export async function executeScenario(entry: PreparedScenario): Promise<void> {
    const { scenario, apiConfig, userSetting, rpcConfig, onchainContext, portfolioContext } = entry;
    const { instrumentAddress, expiry, traderAddress } = scenario;

    switch (scenario.type) {
        case 'marketByMargin':
            await runMarketByMarginScenario(
                scenario,
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
                scenario,
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
                scenario,
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
                scenario,
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
                scenario,
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
                scenario,
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
            throwUnsupportedScenario(scenario);
    }
}

function throwUnsupportedScenario(scenario: never): never {
    throw new Error(`Unsupported scenario type: ${String(scenario)}`);
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
    portfolioContext?: PortfolioContext
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
        traderAddress,
        signedSize,
        onchainContext,
        portfolioContext
    );

    const tradeInput = new TradeInput(traderAddress, bigAbs(signedSize), side, marginAmount);

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
        rpcConfig,
        traderAddress,
        signedSize,
        scenarioReadOptions(scenario, artifacts.blockNumber)
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
    portfolioContext?: PortfolioContext
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
        traderAddress,
        signedSize,
        onchainContext,
        portfolioContext
    );

    const tradeInput = new TradeInput(traderAddress, bigAbs(signedSize), side);

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
        rpcConfig,
        traderAddress,
        signedSize,
        scenarioReadOptions(scenario, artifacts.blockNumber)
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
    portfolioContext?: PortfolioContext
): Promise<void> {
    const baseQuantity = BigInt(scenario.input.baseQuantity);
    const signedSize = -baseQuantity;

    if (baseQuantity === 0n) {
        throw new SimulationError('Close size cannot be zero');
    }

    const closeSide = signedSize >= ZERO ? Side.LONG : Side.SHORT;
    const closeInput = new TradeInput(traderAddress, abs(signedSize), closeSide);

    const artifacts = await loadMarketArtifacts(
        scenario,
        apiConfig,
        traderAddress,
        signedSize,
        onchainContext,
        portfolioContext
    );

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
        rpcConfig,
        traderAddress,
        signedSize,
        scenarioReadOptions(scenario, artifacts.blockNumber)
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
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    rpcConfig: RpcConfig,
    onchainContext: PairSnapshot,
    portfolioContext?: PortfolioContext
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
    const [, apiResult] = adjustInput.simulate(apiOnchainContext, userSetting);

    const rpcOnchainContext = await fetchOnchainContextFromRpc(
        instrumentAddress,
        expiry,
        rpcConfig,
        traderAddress,
        undefined,
        scenarioReadOptions(scenario, onchainContext.blockInfo.height)
    );
    const [, rpcResult] = adjustInput.simulate(rpcOnchainContext, userSetting);

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
    instrumentAddress: Address,
    expiry: number,
    traderAddress: Address,
    rpcConfig: RpcConfig,
    onchainContext: PairSnapshot,
    portfolioContext?: PortfolioContext
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
        rpcConfig,
        traderAddress,
        undefined,
        scenarioReadOptions(scenario, onchainContext.blockInfo.height)
    );
    const [rpcParam, rpcResult] = adjustInput.simulate(rpcOnchainContext, userSetting);

    expect(rpcParam.net >= ZERO).toBe(apiParam.net >= ZERO);
    expect(rpcParam.net.toString()).toBe(apiParam.net.toString());
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

    const side = toSide(scenario.input.side);
    const isLong = side === Side.LONG;
    let targetTick = tick;
    if (isLong && targetTick >= context.amm.tick) {
        targetTick = instrumentSetting.alignOrderTick(context.amm.tick - instrumentSetting.orderSpacing);
    } else if (!isLong && targetTick <= context.amm.tick) {
        targetTick = instrumentSetting.alignOrderTick(context.amm.tick + instrumentSetting.orderSpacing);
    }

    const markPriceBufferInBps =
        scenario.input.dappSetting?.markPriceBufferInBps ?? userSetting.markPriceBufferInBps ?? 0;
    const userSettingWithBuffer = new UserSetting(
        userSetting.deadlineOffset,
        userSetting.slippage,
        leverage,
        markPriceBufferInBps,
        userSetting.strictMode
    );

    const placeInput = new PlaceInput(traderAddress, targetTick, baseQuantity, side);

    const apiContextWithPortfolio = context.with({
        portfolio,
    });
    const [apiPlaceParam] = placeInput.simulate(apiContextWithPortfolio, userSettingWithBuffer);

    const rpcContext = await fetchOnchainContextFromRpc(
        instrumentAddress,
        expiry,
        rpcConfig,
        undefined,
        undefined,
        scenarioReadOptions(scenario, context.blockInfo.height)
    );

    const rpcContextWithPortfolio = new PairSnapshot({
        ...getOnchainContextOptions(rpcContext),
        portfolio,
    });
    const [rpcPlaceParam] = placeInput.simulate(rpcContextWithPortfolio, userSettingWithBuffer);

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

async function loadMarketArtifacts(
    scenario: BaseScenario,
    apiConfig: ApiConfig,
    traderAddress: Address,
    signedSize: bigint,
    onchainContext?: PairSnapshot,
    portfolioContext?: PortfolioContext
): Promise<MarketArtifacts> {
    const context =
        onchainContext ?? (await fetchOnchainContext(scenario.instrumentAddress, scenario.expiry, apiConfig));

    let resolvedPortfolio = portfolioContext?.portfolio;
    if (!resolvedPortfolio) {
        const ctxWithTrader = await fetchOnchainContext(
            scenario.instrumentAddress,
            scenario.expiry,
            apiConfig,
            traderAddress
        );
        resolvedPortfolio = ctxWithTrader.portfolio;
    }

    const position = resolvedPortfolio?.position ?? createEmptyPortfolio().position;

    const market = createQueryMarketModule(apiConfig);
    const quotation = await market.fetchFuturesInstrumentInquire({
        chainId: scenario.chainId,
        expiry: scenario.expiry,
        instrument: scenario.instrumentAddress,
        size: signedSize.toString(),
    });

    if (!quotation) {
        throw new SimulationError('Quotation is required to build simulation context');
    }

    if (quotation.entryNotional === 0n && signedSize !== 0n) {
        throw new SimulationError(`Invalid quotation: entryNotional is zero for size ${signedSize}`);
    }

    if (process.env.DEBUG_PARITY_TEST && context.blockInfo?.height) {
        console.log(`[DEBUG] Context block: ${context.blockInfo.height}, Quotation fetch time: ${Date.now()}`);
    }

    const markPrice = context.priceData.markPrice;
    const { instrumentSetting } = context;

    const marketContext = {
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
        quotationWithSize,
        blockNumber: context.blockInfo?.height,
    };
}

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
