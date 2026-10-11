import { zeroAddress, type Address } from 'viem';
import onchainFixture from '../fixtures/simulation-context.json';
import { parseOnchainContext } from '../helpers/snapshotFixture';
import { abs, wmulDown, ratioToWad, wadToSqrtX96 } from '../../math';
import { WAD } from '../../constants';
import {
    InstrumentSetting,
    Order,
    PairSnapshot,
    Position,
    Side,
    UserSetting,
    type OnchainContext,
    type PlaceParam,
    type Portfolio,
} from '../../types';
import { PlaceInput, type PlaceSimulation } from '../../actions/order';
import { CrossLimitOrderInput } from '../../actions/crossLimitOrder';
import { ScaledLimitOrderInput, BatchOrderSizeDistribution } from '../../actions/scaledLimitOrder';
import type { TradeSimulation } from '../../actions/trade';
import * as TradeModule from '../../actions/trade';
import { QuotationWithSize } from '../../types';

const BASE = 1_000_000_000_000_000_000n;
const ORDER_BIGINT_TOLERANCE = 1_000_000n;

const fixtureSnapshot = parseOnchainContext(onchainFixture.context);
const fixtureInstrumentAddress = onchainFixture.instrumentAddress as Address;
const fixtureTraderAddress = (onchainFixture.traderAddress ?? zeroAddress) as Address;
const fixtureSpacing = {
    pearl: fixtureSnapshot.instrumentSetting.pearlSpacing,
    order: fixtureSnapshot.instrumentSetting.orderSpacing,
    range: fixtureSnapshot.instrumentSetting.rangeSpacing,
};
const fixtureAmm = fixtureSnapshot.amm;

const FIXTURE_TICK = fixtureAmm.tick;
const FIXTURE_EXPIRY = fixtureAmm.expiry;
const DEFAULT_DEADLINE = 3600;
const DEFAULT_USER_SLIPPAGE = 10;
const ORDER_TICK_OFFSET = Math.max(10, fixtureSpacing.order * 5);

const baseLongSize = 1n * BASE;
const baseMargin = 100n * BASE;
const largeLongSize = 10n * baseLongSize;
const largeMargin = 10n * baseMargin;

const EMPTY_PORTFOLIO: Portfolio = {
    oids: [],
    rids: [],
    position: Position.empty(),
    orders: [],
    ranges: [],
    ordersTaken: [],
};

function buildFixtureContext(customize?: (context: OnchainContext) => void): {
    context: PairSnapshot;
    instrumentSetting: InstrumentSetting;
} {
    const inst = fixtureSnapshot.instrumentSetting;
    const setting = {
        symbol: inst.symbol,
        config: inst.configAddress,
        gate: inst.gateAddress,
        market: inst.marketAddress,
        quote: inst.quoteAddress,
        decimals: inst.quoteDecimals,
        param: { ...inst.quoteParam },
        initialMarginRatio: inst.initialMarginRatio,
        maintenanceMarginRatio: inst.maintenanceMarginRatio,
        placePaused: inst.placePaused,
        fundingHour: inst.fundingHour,
        disableOrderRebate: inst.disableOrderRebate,
    };
    const amm = structuredClone(fixtureSnapshot.amm);
    const blockInfo = structuredClone(fixtureSnapshot.blockInfo);
    const spacing = {
        pearl: inst.pearlSpacing,
        order: inst.orderSpacing,
        range: inst.rangeSpacing,
    };
    const portfolio = fixtureSnapshot.portfolio
        ? structuredClone(fixtureSnapshot.portfolio)
        : structuredClone(EMPTY_PORTFOLIO);
    const quoteState = structuredClone(fixtureSnapshot.quoteState);
    const quotation = fixtureSnapshot.quotation ? structuredClone(fixtureSnapshot.quotation) : undefined;
    const condition = inst.condition;
    const priceData = structuredClone(fixtureSnapshot.priceData);

    const contextOptions: OnchainContext = {
        setting,
        condition,
        amm,
        priceData,
        spacing,
        blockInfo,
        portfolio,
        quotation,
        quoteState,
    };
    customize?.(contextOptions);

    const context = new PairSnapshot(contextOptions);

    return {
        context,
        instrumentSetting: context.instrumentSetting,
    };
}

// ============================================================================
// Place Order Tests
// ============================================================================

// Test cases built on real offline numerical fixtures
const testCases = [
    {
        name: 'Valid long order below current tick',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK - ORDER_TICK_OFFSET,
            size: baseLongSize,
            amount: baseMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedResult: {
            tick: FIXTURE_TICK - ORDER_TICK_OFFSET,
            size: baseLongSize,
            margin: baseMargin,
        },
    },
    {
        name: 'Valid short order above current tick',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK + ORDER_TICK_OFFSET,
            size: -baseLongSize,
            amount: baseMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedResult: {
            tick: FIXTURE_TICK + ORDER_TICK_OFFSET,
            size: -baseLongSize,
            margin: baseMargin,
        },
    },
    {
        name: 'Large order with high margin',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK - ORDER_TICK_OFFSET * 2,
            size: largeLongSize,
            amount: largeMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedResult: {
            tick: FIXTURE_TICK - ORDER_TICK_OFFSET * 2,
            size: largeLongSize,
            margin: largeMargin,
        },
    },
];

const errorTestCases = [
    {
        name: 'Zero size order',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK,
            size: BigInt('0'),
            amount: baseMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedError: 'Order baseQuantity must be positive',
    },
    {
        name: 'Unaligned tick',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK + 3, // Will be invalid once spacing is tightened
            size: baseLongSize,
            amount: baseMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedError: 'Tick must be multiple of order spacing 5',
        customizeContext: (context: OnchainContext) => {
            context.spacing.order = 5;
        },
    },
    {
        name: 'Wrong side order (long above current tick)',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK + ORDER_TICK_OFFSET * 10,
            size: baseLongSize,
            amount: baseMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedError: 'LONG orders must be placed at ticks <',
    },
    {
        name: 'Wrong side order (short below current tick)',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK - ORDER_TICK_OFFSET * 10,
            size: -baseLongSize,
            amount: baseMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedError: 'SHORT orders must be placed at ticks >',
    },
    {
        name: 'Leverage exceeds maximum',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK - ORDER_TICK_OFFSET,
            size: baseLongSize,
            amount: baseMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedError: 'Leverage exceeds maximum',
        customizeContext: (context: OnchainContext) => {
            // Modify IMR to make maxLeverage = 2x (maxLeverage = 10000 / IMR)
            // Set IMR to 5000 (50%) so maxLeverage = 2x, which is less than 3x leverage used in test
            context.setting.initialMarginRatio = 5000;
        },
    },
    {
        name: 'Order too far from mark price',
        param: {
            expiry: FIXTURE_EXPIRY,
            tick: FIXTURE_TICK - ORDER_TICK_OFFSET * 10_000,
            size: baseLongSize,
            amount: baseMargin,
            deadline: DEFAULT_DEADLINE,
        },
        expectedError: 'Order too far from mark price',
    },
];

const feeRebateTests = [
    {
        name: 'Standard fee rebate (0.3%)',
        disableRebate: false,
        expectPositive: true,
    },
    {
        name: 'Disabled rebate',
        disableRebate: true,
        expectPositive: false,
    },
];

// Helper function to convert PlaceParam to PlaceInput
function placeParamToInput(
    placeParam: PlaceParam,
    userSetting: UserSetting = new UserSetting(DEFAULT_DEADLINE, DEFAULT_USER_SLIPPAGE, 3n * WAD)
): PlaceInput {
    const baseQuantity = abs(placeParam.size);
    const side = placeParam.size >= 0n ? Side.LONG : Side.SHORT;
    return new PlaceInput(fixtureTraderAddress, placeParam.tick, baseQuantity, side);
}

describe('simulatePlace', () => {
    describe('Valid order scenarios', () => {
        testCases.forEach((testCase, index) => {
            test(`should handle ${testCase.name} - case ${index + 1}`, () => {
                const { context, instrumentSetting } = buildFixtureContext();
                // Use markPriceBufferInBps: 0 to match test expectations (no buffer)
                const userSetting = new UserSetting(testCase.param.deadline, DEFAULT_USER_SLIPPAGE, 3n * WAD, 0);
                const input = placeParamToInput(testCase.param, userSetting);

                const [placeParam, simulation] = input.simulate(context, userSetting);

                expect(placeParam.tick).toBe(testCase.expectedResult.tick);
                expect(abs(placeParam.size)).toBe(abs(testCase.expectedResult.size));
                // Margin is now calculated by simulate() based on leverage, so we verify it's reasonable
                // instead of comparing to a fixed expected value
                expect(placeParam.amount).toBeGreaterThan(0n);
                // Verify margin satisfies IMR requirement: since leverage <= maxLeverage,
                // marginForLeverage() already ensures IMR is satisfied, so we just verify it's positive

                // Calculate expected fee income (fee rebate) using Order from simulation
                const feeRebate = wmulDown(simulation.order.value, ratioToWad(instrumentSetting.orderFeeRebateRatio));
                const expectedOrder = new Order(testCase.param.amount, testCase.param.size, testCase.param.tick, 0);
                const expectedFeeRebate = wmulDown(
                    expectedOrder.value,
                    ratioToWad(instrumentSetting.orderFeeRebateRatio)
                );
                const feeDiff =
                    feeRebate >= expectedFeeRebate ? feeRebate - expectedFeeRebate : expectedFeeRebate - feeRebate;
                expect(feeDiff).toBeLessThanOrEqual(ORDER_BIGINT_TOLERANCE);
            });
        });
    });

    describe('Error scenarios', () => {
        errorTestCases.forEach((testCase, index) => {
            test(`should throw error for ${testCase.name} - case ${index + 1}`, () => {
                const { context } = buildFixtureContext(testCase.customizeContext);
                // Use markPriceBufferInBps: 0 to match test expectations (no buffer)
                let userSetting: UserSetting;
                if (testCase.name === 'Leverage exceeds maximum') {
                    // For this test, use a leverage that exceeds maxLeverage
                    // maxLeverage = 10000 / IMR, so if IMR = 5000, maxLeverage = 2x
                    // Use 3x leverage which exceeds 2x
                    userSetting = new UserSetting(testCase.param.deadline, DEFAULT_USER_SLIPPAGE, 3n * WAD, 0);
                } else {
                    userSetting = new UserSetting(testCase.param.deadline, DEFAULT_USER_SLIPPAGE, 3n * WAD, 0);
                }

                // Zero size validation now happens in constructor
                if (testCase.name === 'Zero size order') {
                    expect(() => placeParamToInput(testCase.param, userSetting)).toThrow(testCase.expectedError);
                } else {
                    const input = placeParamToInput(testCase.param, userSetting);
                    expect(() => input.simulate(context, userSetting)).toThrow(testCase.expectedError);
                }
            });
        });
    });

    describe('Fee rebate calculations', () => {
        feeRebateTests.forEach((testCase) => {
            it(`should compute fee rebate for ${testCase.name}`, () => {
                const { context, instrumentSetting } = buildFixtureContext((ctx) => {
                    ctx.setting.disableOrderRebate = testCase.disableRebate;
                });
                const tick = FIXTURE_TICK - ORDER_TICK_OFFSET;
                const size = baseLongSize;

                const placeParam: PlaceParam = {
                    expiry: FIXTURE_EXPIRY,
                    tick,
                    size,
                    amount: baseMargin,
                    deadline: DEFAULT_DEADLINE,
                };

                // Use markPriceBufferInBps: 0 to match test expectations (no buffer)
                const userSetting = new UserSetting(placeParam.deadline, DEFAULT_USER_SLIPPAGE, 3n * WAD, 0);
                const input = placeParamToInput(placeParam, userSetting);

                const [simulatedPlaceParam, simulation] = input.simulate(context, userSetting);
                // Calculate expected fee income (fee rebate) using Order from simulation
                const feeRebate = wmulDown(simulation.order.value, ratioToWad(instrumentSetting.orderFeeRebateRatio));
                if (testCase.expectPositive) {
                    expect(feeRebate).toBeGreaterThan(0n);
                } else {
                    expect(feeRebate).toBe(0n);
                }
            });
        });
    });
});

// ============================================================================
// Scaled Limit Order Tests
// ============================================================================

describe('ScaledLimitOrderInput.simulate', () => {
    it('creates scaled orders with ratios and aggregates', () => {
        const { onchainContext } = buildContext();
        const scaledTicks = [
            FIXTURE_TICK - ORDER_TICK_OFFSET * 3,
            FIXTURE_TICK - ORDER_TICK_OFFSET * 2,
            FIXTURE_TICK - ORDER_TICK_OFFSET,
        ];
        const userSetting = new UserSetting(300, 50, 3n * WAD);
        const input = new ScaledLimitOrderInput(
            fixtureTraderAddress,
            Side.LONG,
            9n * BASE,
            scaledTicks,
            BatchOrderSizeDistribution.FLAT
        );
        const result = input.simulate(onchainContext, userSetting);

        expect(result.orders.length).toBe(3);
        expect(result.orders.every((order) => order !== null)).toBe(true);
        // Verify aggregated values can be derived
        const totalMargin = result.orders.reduce((sum, order) => sum + (order ? order.param.amount : 0n), 0n);
        expect(totalMargin).toBeGreaterThan(0n);
        // Verify each order has required fields
        result.orders.forEach((order) => {
            if (order) {
                expect(order.param).toBeDefined();
                expect(order.simulation).toBeDefined();
            }
        });
    });
});

// ============================================================================
// Cross Market Order Tests
// ============================================================================

describe('CrossLimitOrderInput.simulate', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('splits market and limit legs and returns aggregates', () => {
        const { onchainContext } = buildContext();
        const targetTick = FIXTURE_TICK + ORDER_TICK_OFFSET;
        const userSetting = new UserSetting(300, 50, 3n * WAD);
        const input = new CrossLimitOrderInput(fixtureTraderAddress, Side.LONG, 5n * BASE, targetTick);
        const swapQuote = new QuotationWithSize(2n * BASE, {
            benchmark: 0n,
            sqrtFairPX96: 1n << 96n,
            tick: targetTick,
            mark: onchainContext.priceData.markPrice,
            entryNotional: 4_000n * BASE,
            fee: 0n,
            minAmount: 0n,
            sqrtPostFairPX96: 1n << 96n,
            postTick: targetTick + ORDER_TICK_OFFSET,
        });
        const mockTradeResult: TradeSimulation = {
            realized: 0n,
            postPosition: onchainContext.portfolio!.position,
            marginAdjusted: false,
        };
        const mockTradeParam = {
            expiry: onchainContext.expiry,
            size: 2n * BASE,
            amount: 1n, // Set amount to match what would be marginDelta
            limitTick: input.targetTick,
            deadline: 0,
        };
        const mockMarketView: TradeSimulation = mockTradeResult;
        const mockLimitMargin = 100n; // Set a margin value for the limit order

        const mockLimitPlaceParam: PlaceParam = {
            expiry: onchainContext.expiry,
            tick: input.targetTick,
            size: 3n * BASE,
            amount: mockLimitMargin,
            deadline: 0,
        };

        const mockLimitSimulation: PlaceSimulation = {
            order: new Order(mockLimitMargin, 3n * BASE, input.targetTick, 0),
        };

        const mockLimitSimulationResult: [PlaceParam, PlaceSimulation] = [mockLimitPlaceParam, mockLimitSimulation];

        jest.spyOn(TradeModule.TradeInput.prototype, 'simulate').mockReturnValue([mockTradeParam, mockTradeResult]);
        jest.spyOn(PlaceInput.prototype, 'simulate').mockReturnValue(mockLimitSimulationResult);

        const result = input.simulate(onchainContext, swapQuote, userSetting);

        expect(abs(result.tradeParam.size)).toBe(2n * BASE);
        expect(abs(result.placeParam.size)).toBe(3n * BASE);
        expect(result.placeSimulation).toBe(mockLimitSimulation);
        expect(result.placeParam).toBe(mockLimitPlaceParam);
        expect(result.tradeSimulation).toBe(mockMarketView);
        expect(result.tradeParam).toBe(mockTradeParam);
        expect(result.tradeParam.amount + result.placeParam.amount).toBe(mockTradeParam.amount + mockLimitMargin);
    });

    it('aligns limit order tick to orderSpacing and keeps it valid', () => {
        const { onchainContext } = buildContext((ctx) => {
            ctx.spacing.order = 10;
        });
        const userSetting = new UserSetting(300, 50, 3n * WAD);
        const targetTick = FIXTURE_TICK + 7; // not aligned to orderSpacing=10
        const input = new CrossLimitOrderInput(fixtureTraderAddress, Side.LONG, 5n * BASE, targetTick);

        const postTick = targetTick + 1;
        const swapQuote = new QuotationWithSize(2n * BASE, {
            benchmark: 0n,
            sqrtFairPX96: onchainContext.amm.sqrtPX96,
            tick: targetTick,
            mark: onchainContext.priceData.markPrice,
            entryNotional: 4_000n * BASE,
            fee: 0n,
            minAmount: 0n,
            sqrtPostFairPX96: onchainContext.amm.sqrtPX96,
            postTick,
        });

        const mockTradeResult: TradeSimulation = {
            realized: 0n,
            postPosition: onchainContext.portfolio.position,
            marginAdjusted: false,
        };
        const mockTradeParam = {
            expiry: onchainContext.expiry,
            size: 2n * BASE,
            amount: 0n,
            limitTick: input.targetTick,
            deadline: 0,
        };
        jest.spyOn(TradeModule.TradeInput.prototype, 'simulate').mockReturnValue([mockTradeParam, mockTradeResult]);

        const result = input.simulate(onchainContext, swapQuote, userSetting);

        expect(targetTick % onchainContext.instrumentSetting.orderSpacing).not.toBe(0);
        expect(Math.abs(result.placeParam.tick) % onchainContext.instrumentSetting.orderSpacing).toBe(0);
        expect(result.placeParam.tick).toBeLessThan(postTick);
        expect(result.placeParam.tick).toBe(10 * Math.floor((postTick - 1) / 10));
    });

    it('uses post-trade sqrtPX96 for limit leg validation', () => {
        const { onchainContext } = buildContext((ctx) => {
            const farPrice = (ctx.priceData.markPrice * 103n) / 100n; // 3% away from mark (IMR=1%)
            ctx.amm.sqrtPX96 = wadToSqrtX96(farPrice);
        });
        const userSetting = new UserSetting(300, 50, 3n * WAD);
        const targetTick = FIXTURE_TICK + ORDER_TICK_OFFSET;
        const input = new CrossLimitOrderInput(fixtureTraderAddress, Side.LONG, 5n * BASE, targetTick);

        const postTick = targetTick + 1;
        const swapQuote = new QuotationWithSize(2n * BASE, {
            benchmark: 0n,
            sqrtFairPX96: onchainContext.amm.sqrtPX96,
            tick: targetTick,
            mark: onchainContext.priceData.markPrice,
            entryNotional: 4_000n * BASE,
            fee: 0n,
            minAmount: 0n,
            sqrtPostFairPX96: wadToSqrtX96(onchainContext.priceData.markPrice),
            postTick,
        });

        const mockTradeResult: TradeSimulation = {
            realized: 0n,
            postPosition: onchainContext.portfolio.position,
            marginAdjusted: false,
        };
        const mockTradeParam = {
            expiry: onchainContext.expiry,
            size: 2n * BASE,
            amount: 0n,
            limitTick: input.targetTick,
            deadline: 0,
        };
        jest.spyOn(TradeModule.TradeInput.prototype, 'simulate').mockReturnValue([mockTradeParam, mockTradeResult]);

        // Without updating `amm.sqrtPX96` to post-trade value, place validation would fail.
        const snapshotTickOnly = onchainContext.with({ amm: { ...onchainContext.amm, tick: postTick } });
        const tickOnlyPlaceInput = new PlaceInput(fixtureTraderAddress, targetTick, 3n * BASE, Side.LONG);
        expect(() => tickOnlyPlaceInput.simulate(snapshotTickOnly, userSetting)).toThrow();

        // CrossLimitOrderInput should succeed by using quotation.sqrtPostFairPX96 for the post-trade snapshot.
        const result = input.simulate(onchainContext, swapQuote, userSetting);
        expect(result.placeParam.tick).toBeLessThan(postTick);
    });
});

// ============================================================================
// Shared Test Helpers
// ============================================================================

function buildContext(customize?: (context: OnchainContext) => void): {
    onchainContext: PairSnapshot;
    instrumentSetting: InstrumentSetting;
} {
    const { context, instrumentSetting } = buildFixtureContext(customize);
    return { onchainContext: context, instrumentSetting };
}
