import { zeroAddress, type Address } from 'viem';
import fixtureData from './fixtures/addLiqAsymmetric.fixtures.json';
import onchainFixture from './fixtures/onchain-context.abc.json';
import { parseOnchainContext } from './helpers/abcFixture';
import { RATIO_BASE, WAD } from '../constants';
import { AddInput, RemoveInput } from '../actions/range';
import {
    Condition,
    Order,
    PairSnapshot,
    PERP_EXPIRY,
    Position,
    Range,
    Status,
    UserSetting,
    type Amm,
    type Portfolio,
    type Setting,
} from '../types';
import { abs, tickToWad, wdiv, wmul } from '../math';

const abcOnchainContext = parseOnchainContext(onchainFixture.context);
const fixtureInstrumentAddress = onchainFixture.instrumentAddress as Address;
const fixtureTraderAddress = (onchainFixture.traderAddress ?? zeroAddress) as Address;
const fixtureSpacing = {
    pearl: abcOnchainContext.instrumentSetting.pearlSpacing,
    order: abcOnchainContext.instrumentSetting.orderSpacing,
    range: abcOnchainContext.instrumentSetting.rangeSpacing,
};
const fixturePriceData = abcOnchainContext.priceData;
const fixtureBlockInfo = abcOnchainContext.blockInfo;
const fixtureQuoteState = abcOnchainContext.quoteState;
const fixtureSetting = {
    symbol: abcOnchainContext.instrumentSetting.symbol,
    config: abcOnchainContext.instrumentSetting.configAddress,
    gate: abcOnchainContext.instrumentSetting.gateAddress,
    market: abcOnchainContext.instrumentSetting.marketAddress,
    quote: abcOnchainContext.instrumentSetting.quoteAddress,
    decimals: abcOnchainContext.instrumentSetting.quoteDecimals,
    param: abcOnchainContext.instrumentSetting.quoteParam,
    initialMarginRatio: abcOnchainContext.instrumentSetting.initialMarginRatio,
    maintenanceMarginRatio: abcOnchainContext.instrumentSetting.maintenanceMarginRatio,
    placePaused: abcOnchainContext.instrumentSetting.placePaused,
    fundingHour: abcOnchainContext.instrumentSetting.fundingHour,
    disableOrderRebate: abcOnchainContext.instrumentSetting.disableOrderRebate,
};
const fixtureAmm = abcOnchainContext.amm;

const DEFAULT_TEST_SPACING = {
    pearlSpacing: fixtureSpacing.pearl,
    orderSpacing: fixtureSpacing.order,
    rangeSpacing: fixtureSpacing.range,
};

const ADD_TEST_SPACING = {
    pearlSpacing: 1,
    orderSpacing: 1,
    rangeSpacing: 1,
};

const DEFAULT_PRICE_TOLERANCE_BPS = 50;
const CAPITAL_EFFICIENCY_TOLERANCE = 5;

function expectBigIntClose(actual: bigint, expected: bigint, toleranceBps: number = DEFAULT_PRICE_TOLERANCE_BPS) {
    const difference = actual >= expected ? actual - expected : expected - actual;
    const magnitude = expected >= 0n ? expected : -expected;
    const base = magnitude === 0n ? 1n : magnitude;
    const tolerance = (base * BigInt(toleranceBps)) / 10_000n;
    const allowed = tolerance > 0n ? tolerance : 1n;
    expect(difference).toBeLessThanOrEqual(allowed);
}

const toBigInt = (value: string | number | bigint): bigint => {
    if (typeof value === 'string') {
        return BigInt(value);
    }
    if (typeof value === 'number') {
        return BigInt(value);
    }
    return value;
};

const snapToSpacing = (tick: number): number =>
    Math.floor(tick / DEFAULT_TEST_SPACING.rangeSpacing) * DEFAULT_TEST_SPACING.rangeSpacing;

const addFixtureCase = fixtureData.simulateAdd[0];
const fixtureRangeTicks = {
    lower: snapToSpacing(fixtureAmm.tick - DEFAULT_TEST_SPACING.rangeSpacing),
    upper: snapToSpacing(fixtureAmm.tick + DEFAULT_TEST_SPACING.rangeSpacing),
};
const fixtureRange = new Range(
    toBigInt(addFixtureCase.input.amm.liquidity),
    toBigInt(addFixtureCase.input.amm.feeIndex),
    toBigInt(addFixtureCase.output.lowerPosition.balance),
    toBigInt(addFixtureCase.input.amm.sqrtPX96),
    fixtureRangeTicks.lower,
    fixtureRangeTicks.upper
);
const fixturePosition = new Position(
    toBigInt(addFixtureCase.output.lowerPosition.balance),
    toBigInt(addFixtureCase.output.lowerPosition.size),
    toBigInt(addFixtureCase.output.lowerPosition.entryNotional),
    toBigInt(addFixtureCase.output.lowerPosition.entrySocialLossIndex),
    toBigInt(addFixtureCase.output.lowerPosition.entryFundingIndex)
);

// ============================================================================
// Add Liquidity Tests
// ============================================================================

describe('simulateAdd', () => {
    const testCases = fixtureData.simulateAdd;

    testCases.forEach((testCase, index) => {
        test(`should correctly simulate asymmetric range liquidity addition - case ${index + 1}`, () => {
            const { input, output: expectedOutput } = testCase;

            // Convert string values to proper types for the AMM object
            const amm: Amm = {
                ...input.amm,
                sqrtPX96: BigInt(input.amm.sqrtPX96),
                liquidity: BigInt(input.amm.liquidity),
                totalLiquidity: BigInt(input.amm.totalLiquidity),
                totalShort: BigInt(input.amm.totalShort),
                openInterests: BigInt(input.amm.openInterests),
                totalLong: BigInt(input.amm.totalLong),
                involvedFund: BigInt(input.amm.involvedFund),
                feeIndex: BigInt(input.amm.feeIndex),
                protocolFee: BigInt(input.amm.protocolFee),
                longSocialLossIndex: BigInt(input.amm.longSocialLossIndex),
                shortSocialLossIndex: BigInt(input.amm.shortSocialLossIndex),
                longFundingIndex: BigInt(input.amm.longFundingIndex),
                shortFundingIndex: BigInt(input.amm.shortFundingIndex),
                insuranceFund: BigInt(input.amm.insuranceFund),
                settlementPrice: BigInt(input.amm.settlementPrice),
            };

            // Create InstrumentSetting from input data
            const minRangeValue = BigInt(input.minRangeValue);
            const minMarginAmount = (minRangeValue * BigInt(input.imr)) / (BigInt(RATIO_BASE) * 10n);
            const setting: Setting = {
                ...fixtureSetting,
                initialMarginRatio: input.imr,
                maintenanceMarginRatio: input.imr / 2, // Typically half of IMR
                param: {
                    ...fixtureSetting.param,
                    minMarginAmount,
                },
            };

            // Convert string values to proper types for the param object
            const userSetting = new UserSetting(0, 0, 3n * WAD);
            const addInput = new AddInput(
                fixtureTraderAddress,
                BigInt(input.param.margin),
                input.param.lowerTick,
                input.param.upperTick,
                userSetting
            );

            // Create OnchainContext for simulate()
            const onchainContext = new PairSnapshot({
                setting,
                condition: Condition.NORMAL,
                amm,
                priceData: {
                    ...fixturePriceData,
                    instrument: fixtureInstrumentAddress,
                    expiry: input.amm.expiry,
                },
                spacing: {
                    pearl: ADD_TEST_SPACING.pearlSpacing,
                    order: ADD_TEST_SPACING.orderSpacing,
                    range: ADD_TEST_SPACING.rangeSpacing,
                },
                blockInfo: { timestamp: 0, height: 0 },
                portfolio: PairSnapshot.emptyPortfolio(),
                quoteState: fixtureQuoteState,
            });
            const [, result] = addInput.simulate(onchainContext, userSetting);

            // Derive positions from range using the amm from the context
            const lowerPosition = result.range.lowerPositionIfRemove(amm);
            const upperPosition = result.range.upperPositionIfRemove(amm);

            // Validate removal prices
            const expectedUpperRemovalPrice = BigInt(expectedOutput.upperRemovalPrice);
            const expectedLowerRemovalPrice = BigInt(expectedOutput.lowerRemovalPrice);
            const lowerPrice = tickToWad(result.range.tickLower);
            const upperPrice = tickToWad(result.range.tickUpper);
            expectBigIntClose(upperPrice, expectedUpperRemovalPrice);
            expectBigIntClose(lowerPrice, expectedLowerRemovalPrice);

            // Validate lower position (only fields that are actually returned by the function)
            expectBigIntClose(lowerPosition.balance, BigInt(expectedOutput.lowerPosition.balance));
            expectBigIntClose(lowerPosition.size, BigInt(expectedOutput.lowerPosition.size));
            expectBigIntClose(lowerPosition.entryNotional, BigInt(expectedOutput.lowerPosition.entryNotional));
            expect(lowerPosition.entrySocialLossIndex.toString()).toBe(expectedOutput.lowerPosition.entrySocialLossIndex);
            expect(lowerPosition.entryFundingIndex.toString()).toBe(expectedOutput.lowerPosition.entryFundingIndex);

            // Validate upper position (only fields that are actually returned by the function)
            expectBigIntClose(upperPosition.balance, BigInt(expectedOutput.upperPosition.balance));
            expectBigIntClose(upperPosition.size, BigInt(expectedOutput.upperPosition.size));
            expectBigIntClose(upperPosition.entryNotional, BigInt(expectedOutput.upperPosition.entryNotional));
            expect(upperPosition.entrySocialLossIndex.toString()).toBe(expectedOutput.upperPosition.entrySocialLossIndex);
            expect(upperPosition.entryFundingIndex.toString()).toBe(expectedOutput.upperPosition.entryFundingIndex);

            // Validate leverage values (allow for small differences due to calculation precision)
            // Derive leverage from positions (lowerPrice and upperPrice already declared above)
            const lowerLeverage =
                lowerPosition.balance === 0n
                    ? 0n
                    : wdiv(wmul(lowerPrice, abs(lowerPosition.size)), abs(lowerPosition.balance));
            const upperLeverage =
                upperPosition.balance === 0n
                    ? 0n
                    : wdiv(wmul(upperPrice, abs(upperPosition.size)), abs(upperPosition.balance));

            const expectedLowerLeverage = BigInt(expectedOutput.lowerLeverage);
            const expectedUpperLeverage = BigInt(expectedOutput.upperLeverage);
            const leverageTolerance = WAD / 10n; // 0.1 tolerance
            const lowerLeverageDiff =
                lowerLeverage >= expectedLowerLeverage
                    ? lowerLeverage - expectedLowerLeverage
                    : expectedLowerLeverage - lowerLeverage;
            const upperLeverageDiff =
                upperLeverage >= expectedUpperLeverage
                    ? upperLeverage - expectedUpperLeverage
                    : expectedUpperLeverage - upperLeverage;
            expect(lowerLeverageDiff).toBeLessThanOrEqual(leverageTolerance);
            expect(upperLeverageDiff).toBeLessThanOrEqual(leverageTolerance);

            // Validate minimum margin
            const minLiquidity = onchainContext.instrumentSetting.minLiquidity(amm.sqrtPX96);
            const minMargin = Range.minMargin(
                result.range.tickLower,
                result.range.tickUpper,
                amm.sqrtPX96,
                minLiquidity,
                onchainContext.instrumentSetting.imr
            );
            expectBigIntClose(minMargin, BigInt(expectedOutput.minMargin));

            // Validate capital efficiency boost (with tolerance for calculation differences)
            const tickDeltaLower = Math.abs(result.range.tickLower - amm.tick);
            const tickDeltaUpper = Math.abs(result.range.tickUpper - amm.tick);
            const alphaLowerNumber = Range.tickDeltaToAlphaNumber(tickDeltaLower);
            const alphaUpperNumber = Range.tickDeltaToAlphaNumber(tickDeltaUpper);
            const capitalEfficiencyBoost =
                alphaLowerNumber === alphaUpperNumber
                    ? Range.calcBoost(alphaLowerNumber, onchainContext.instrumentSetting.imr)
                    : Range.calcAsymmetricBoost(alphaLowerNumber, alphaUpperNumber, onchainContext.instrumentSetting.imr);
            expect(Math.abs(capitalEfficiencyBoost - expectedOutput.capitalEfficiencyBoost)).toBeLessThan(
                CAPITAL_EFFICIENCY_TOLERANCE
            );
        });
    });

    test('should return result with correct structure and properties', () => {
        const testCase = testCases[0];
        const { input } = testCase;

        // Convert string values to proper types
        const amm: Amm = {
            ...input.amm,
            sqrtPX96: BigInt(input.amm.sqrtPX96),
            liquidity: BigInt(input.amm.liquidity),
            totalLiquidity: BigInt(input.amm.totalLiquidity),
            totalShort: BigInt(input.amm.totalShort),
            openInterests: BigInt(input.amm.openInterests),
            totalLong: BigInt(input.amm.totalLong),
            involvedFund: BigInt(input.amm.involvedFund),
            feeIndex: BigInt(input.amm.feeIndex),
            protocolFee: BigInt(input.amm.protocolFee),
            longSocialLossIndex: BigInt(input.amm.longSocialLossIndex),
            shortSocialLossIndex: BigInt(input.amm.shortSocialLossIndex),
            longFundingIndex: BigInt(input.amm.longFundingIndex),
            shortFundingIndex: BigInt(input.amm.shortFundingIndex),
            insuranceFund: BigInt(input.amm.insuranceFund),
            settlementPrice: BigInt(input.amm.settlementPrice),
        };

        // Create SettingWrapper from input data
        const minRangeValue = BigInt(input.minRangeValue);
        const minMarginAmount = (minRangeValue * BigInt(input.imr)) / (BigInt(RATIO_BASE) * 10n);
        const setting: Setting = {
            ...fixtureSetting,
            initialMarginRatio: input.imr,
            maintenanceMarginRatio: input.imr / 2, // Typically half of IMR
            param: {
                ...fixtureSetting.param,
                minMarginAmount,
            },
        };

        const userSetting = new UserSetting(0, 0, 3n * WAD);
        const addInput = new AddInput(
            fixtureTraderAddress,
            BigInt(input.param.margin),
            input.param.lowerTick,
            input.param.upperTick,
            userSetting
        );

        // Create PairSnapshot for simulate()
        const onchainContext = new PairSnapshot({
            setting,
            condition: Condition.NORMAL,
            amm,
            priceData: {
                ...fixturePriceData,
                instrument: fixtureInstrumentAddress,
                expiry: input.amm.expiry,
            },
            spacing: {
                pearl: ADD_TEST_SPACING.pearlSpacing,
                order: ADD_TEST_SPACING.orderSpacing,
                range: ADD_TEST_SPACING.rangeSpacing,
            },
            blockInfo: { timestamp: 0, height: 0 },
            portfolio: PairSnapshot.emptyPortfolio(),
            quoteState: fixtureQuoteState,
        });
        const [, result] = addInput.simulate(onchainContext, userSetting);

        // Validate structure
        expect(result).toHaveProperty('range');

        // Validate types
        expect(result.range).toBeInstanceOf(Range);
        expect(typeof result.range.tickLower).toBe('number');
        expect(typeof result.range.tickUpper).toBe('number');
        expect(typeof result.range.liquidity).toBe('bigint');
    });
});

// ============================================================================
// Remove Liquidity Tests
// ============================================================================

// Mock dependencies
const fixtureUserSetting = new UserSetting(
    addFixtureCase.input.param.userSetting.deadline,
    addFixtureCase.input.param.userSetting.slippage,
    3n * WAD
);

const fixtureRemoveInput = new RemoveInput(
    fixtureTraderAddress,
    fixtureRangeTicks.lower,
    fixtureRangeTicks.upper,
    fixtureUserSetting
);
const fixtureRangeKey = Range.packKey(fixtureRemoveInput.tickLower, fixtureRemoveInput.tickUpper);

const fixturePortfolio: Portfolio = {
    position: new Position(
        fixturePosition.balance,
        fixturePosition.size,
        fixturePosition.entryNotional,
        fixturePosition.entrySocialLossIndex,
        fixturePosition.entryFundingIndex
    ),
    ranges: [fixtureRange],
    rids: [fixtureRangeKey],
    oids: [],
    orders: [],
    ordersTaken: [],
};

const fixtureOnchainContext: PairSnapshot = createOnchainContext();

function clonePortfolio(portfolio: Portfolio): Portfolio {
    return {
        position: new Position(
            portfolio.position.balance,
            portfolio.position.size,
            portfolio.position.entryNotional,
            portfolio.position.entrySocialLossIndex,
            portfolio.position.entryFundingIndex
        ),
        ranges: portfolio.ranges.map(
            (range) =>
                new Range(
                    range.liquidity,
                    range.entryFeeIndex,
                    range.balance,
                    range.sqrtEntryPX96,
                    range.tickLower,
                    range.tickUpper
                )
        ),
        rids: [...portfolio.rids],
        oids: [...portfolio.oids],
        orders: portfolio.orders.map((order) => new Order(order.balance, order.size, order.tick, order.nonce)),
        ordersTaken: [...portfolio.ordersTaken],
    };
}

// Helper function to create PairSnapshot with custom values
function createOnchainContext(
    amm: Amm = fixtureAmm,
    portfolio: Portfolio = fixturePortfolio,
    setting: Setting = fixtureSetting
): PairSnapshot {
    return new PairSnapshot({
        setting,
        condition: Condition.NORMAL,
        amm: { ...amm },
        priceData: { ...fixturePriceData },
        spacing: {
            pearl: DEFAULT_TEST_SPACING.pearlSpacing,
            order: DEFAULT_TEST_SPACING.orderSpacing,
            range: DEFAULT_TEST_SPACING.rangeSpacing,
        },
        blockInfo: { ...fixtureBlockInfo },
        portfolio: clonePortfolio(portfolio),
        quoteState: fixtureQuoteState,
    });
}

describe('simulateRemove', () => {
    describe('RemoveInput.simulate', () => {
        it('should convert input to param correctly', () => {
            const [removeParam] = fixtureRemoveInput.simulate(fixtureOnchainContext, fixtureUserSetting);

            expect(removeParam.expiry).toBe(fixtureOnchainContext.expiry);
            expect(removeParam.target).toBe(fixtureRemoveInput.traderAddress);
            expect(removeParam.tickLower).toBe(fixtureRemoveInput.tickLower);
            expect(removeParam.tickUpper).toBe(fixtureRemoveInput.tickUpper);
            const timeToDeadline = removeParam.deadline - fixtureOnchainContext.blockInfo.timestamp;
            expect(timeToDeadline).toBe(fixtureUserSetting.deadlineOffset);
            expect(removeParam.limitTicks).toBeDefined();
        });

        it('should handle different input values', () => {
            const differentUserSetting = new UserSetting(3600, 2000, 3n * WAD);
            const differentRemoveInput = new RemoveInput(
                fixtureTraderAddress,
                fixtureRemoveInput.tickLower,
                fixtureRemoveInput.tickUpper
            );

            const [removeParam] = differentRemoveInput.simulate(fixtureOnchainContext, differentUserSetting);

            expect(removeParam.limitTicks).toBeDefined();
        });
    });

    describe('simulateRemove', () => {
        it('should simulate remove liquidity correctly', () => {
            const [, result] = fixtureRemoveInput.simulate(fixtureOnchainContext, fixtureUserSetting);

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });

        it('should handle zero slippage', () => {
            const userSettingWithZeroSlippage = new UserSetting(3600, 0, 3n * WAD);
            const removeInputWithZeroSlippage = new RemoveInput(
                fixtureTraderAddress,
                fixtureRangeTicks.lower,
                fixtureRangeTicks.upper,
                userSettingWithZeroSlippage
            );
            const [, result] = removeInputWithZeroSlippage.simulate(fixtureOnchainContext, userSettingWithZeroSlippage);

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });

        it('should handle maximum slippage', () => {
            const userSettingWithMaxSlippage = new UserSetting(3600, 10000, 3n * WAD); // 100% slippage
            const removeInputWithMaxSlippage = new RemoveInput(
                fixtureTraderAddress,
                fixtureRangeTicks.lower,
                fixtureRangeTicks.upper,
                userSettingWithMaxSlippage
            );
            const [, result] = removeInputWithMaxSlippage.simulate(fixtureOnchainContext, userSettingWithMaxSlippage);

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });

        it('should handle different AMM tick positions', () => {
            // AMM tick below range
            const ammBelowRange = { ...fixtureAmm, tick: 800 };
            const context1 = createOnchainContext(ammBelowRange, fixturePortfolio);
            const [, result1] = fixtureRemoveInput.simulate(context1, fixtureUserSetting);
            // AMM tick within range
            const ammInRange = { ...fixtureAmm, tick: 1000 };
            const context2 = createOnchainContext(ammInRange, fixturePortfolio);
            const [, result2] = fixtureRemoveInput.simulate(context2, fixtureUserSetting);

            // AMM tick above range
            const ammAboveRange = { ...fixtureAmm, tick: 1200 };
            const context3 = createOnchainContext(ammAboveRange, fixturePortfolio);
            const [, result3] = fixtureRemoveInput.simulate(context3, fixtureUserSetting);

            expect(result1.removedPosition).toBeDefined();
            expect(result2.removedPosition).toBeDefined();
            expect(result3.removedPosition).toBeDefined();
        });

        it('should handle zero liquidity range', () => {
            const rangeWithZeroLiquidity = new Range(
                0n,
                fixtureRange.entryFeeIndex,
                fixtureRange.balance,
                fixtureRange.sqrtEntryPX96,
                fixtureRange.tickLower,
                fixtureRange.tickUpper
            );
            const portfolioWithZeroLiquidity: Portfolio = {
                ...fixturePortfolio,
                ranges: [rangeWithZeroLiquidity],
            };
            const context = createOnchainContext(fixtureAmm, portfolioWithZeroLiquidity);
            const [, result] = fixtureRemoveInput.simulate(context, fixtureUserSetting);

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });

        it('should handle zero balance position', () => {
            const positionWithZeroBalance = fixturePosition.withBalanceDelta(-fixturePosition.balance);
            const portfolio: Portfolio = { ...fixturePortfolio, position: positionWithZeroBalance };
            const [, result] = fixtureRemoveInput.simulate(
                createOnchainContext(fixtureAmm, portfolio),
                fixtureUserSetting
            );

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });

        it('should handle zero size position', () => {
            const positionWithZeroSize = new Position(
                fixturePosition.balance,
                0n,
                fixturePosition.entryNotional,
                fixturePosition.entrySocialLossIndex,
                fixturePosition.entryFundingIndex
            );
            const portfolioWithZeroSize: Portfolio = {
                ...fixturePortfolio,
                position: positionWithZeroSize,
            };
            const context = createOnchainContext(fixtureAmm, portfolioWithZeroSize);
            const [, result] = fixtureRemoveInput.simulate(context, fixtureUserSetting);

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should throw error for invalid RemoveInput (tickLower >= tickUpper)', () => {
            const invalidRemoveInput = new RemoveInput(fixtureTraderAddress, 1100, 900);

            expect(() => {
                invalidRemoveInput.simulate(fixtureOnchainContext, fixtureUserSetting);
            }).toThrow('tickLower must be less than tickUpper');
        });

        it('should throw error for invalid RemoveInput (tickLower == tickUpper)', () => {
            const invalidRemoveInput = new RemoveInput(fixtureTraderAddress, 1000, 1000);

            expect(() => {
                invalidRemoveInput.simulate(fixtureOnchainContext, fixtureUserSetting);
            }).toThrow('tickLower must be less than tickUpper');
        });

        it('should throw error for ticks not multiples of rangeSpacing', () => {
            const invalidRemoveInput = new RemoveInput(
                fixtureTraderAddress,
                901, // Not a multiple of 50
                1100,
                fixtureUserSetting
            );

            expect(() => {
                invalidRemoveInput.simulate(fixtureOnchainContext, fixtureUserSetting);
            }).toThrow('Ticks must be multiples of range spacing');
        });

        it('should throw error for upper tick not multiple of rangeSpacing', () => {
            const invalidRemoveInput = new RemoveInput(
                fixtureTraderAddress,
                900,
                1101, // Not a multiple of 50
                fixtureUserSetting
            );

            expect(() => {
                invalidRemoveInput.simulate(fixtureOnchainContext, fixtureUserSetting);
            }).toThrow('Ticks must be multiples of range spacing');
        });
    });

    describe('Edge Cases', () => {
        it('should handle minimum valid rangeId', () => {
            const [, result] = fixtureRemoveInput.simulate(fixtureOnchainContext, fixtureUserSetting);

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });

        it('should handle maximum valid RemoveParam', () => {
            const [, result] = fixtureRemoveInput.simulate(fixtureOnchainContext, fixtureUserSetting);

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });

        it('should handle very large position', () => {
            const largePosition = new Position(
                1000000000000000000n,
                1000000000000000000n,
                1000000000000000000n,
                1000000n,
                1000000n
            );

            const portfolio: Portfolio = { ...fixturePortfolio, position: largePosition };
            const [, result] = fixtureRemoveInput.simulate(
                createOnchainContext(fixtureAmm, portfolio),
                fixtureUserSetting
            );

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });

        it('should handle very small position', () => {
            const smallPosition = new Position(1n, 1n, 1n, 1n, 1n);

            const portfolio: Portfolio = { ...fixturePortfolio, position: smallPosition };
            const [, result] = fixtureRemoveInput.simulate(
                createOnchainContext(fixtureAmm, portfolio),
                fixtureUserSetting
            );

            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();
        });
    });

    describe('Complete Process Tests', () => {
        it('should handle complete remove liquidity workflow with different inputs', () => {
            // Test with different input parameters
            const testInputs = [
                {
                    name: 'Standard input',
                    input: {
                        instrumentAddress: fixtureInstrumentAddress,
                        traderAddress: fixtureTraderAddress,
                        tickLower: fixtureRangeTicks.lower,
                        tickUpper: fixtureRangeTicks.upper,
                        expiry: PERP_EXPIRY,
                        userSetting: fixtureUserSetting,
                    },
                },
                {
                    name: 'High slippage input',
                    input: {
                        instrumentAddress: fixtureInstrumentAddress,
                        traderAddress: fixtureTraderAddress,
                        tickLower: fixtureRangeTicks.lower,
                        tickUpper: fixtureRangeTicks.upper,
                        expiry: PERP_EXPIRY - 1000,
                        userSetting: new UserSetting(
                            fixtureUserSetting.deadlineOffset + 3600,
                            fixtureUserSetting.slippage * 5,
                            3n * WAD
                        ),
                    },
                },
                {
                    name: 'Zero slippage input',
                    input: {
                        instrumentAddress: fixtureInstrumentAddress,
                        traderAddress: fixtureTraderAddress,
                        tickLower: fixtureRangeTicks.lower,
                        tickUpper: fixtureRangeTicks.upper,
                        expiry: PERP_EXPIRY / 2,
                        userSetting: new UserSetting(
                            Math.max(1800, Math.floor(fixtureUserSetting.deadlineOffset / 2)),
                            0,
                            3n * WAD
                        ), // 0% slippage
                    },
                },
            ];

            testInputs.forEach(({ input }) => {
                const userSetting: UserSetting = input.userSetting || fixtureUserSetting;
                const removeInput = new RemoveInput(input.traderAddress, input.tickLower, input.tickUpper);
                const [, result] = removeInput.simulate(createOnchainContext(), userSetting);

                // Verify simulation results
                expect(result.removedPosition).toBeDefined();
                expect(result.postPosition).toBeDefined();
            });
        });

        it('should validate the complete workflow with realistic market conditions', () => {
            // Create realistic market conditions
            const realisticAmm: Amm = {
                ...fixtureAmm,
                tick: fixtureAmm.tick + 25,
                totalLiquidity: fixtureAmm.totalLiquidity + 10n,
                totalLong: fixtureAmm.totalLong + 10n,
                totalShort: fixtureAmm.totalShort + 10n,
            };

            const realisticRange = new Range(
                fixtureRange.liquidity + 1n,
                fixtureRange.entryFeeIndex,
                fixtureRange.balance,
                fixtureRange.sqrtEntryPX96,
                fixtureRange.tickLower,
                fixtureRange.tickUpper
            );

            const realisticPosition = new Position(
                fixturePosition.balance,
                fixturePosition.size + 1n,
                fixturePosition.entryNotional,
                fixturePosition.entrySocialLossIndex,
                fixturePosition.entryFundingIndex
            );

            const realisticInput = new RemoveInput(
                fixtureTraderAddress,
                fixtureRangeTicks.lower,
                fixtureRangeTicks.upper
            );

            const realisticPortfolio: Portfolio = {
                ...fixturePortfolio,
                position: realisticPosition,
                ranges: [realisticRange],
            };
            const realisticContext = createOnchainContext(realisticAmm, realisticPortfolio);
            const [, result] = realisticInput.simulate(realisticContext, fixtureUserSetting);

            // Verify simulation results
            expect(result.removedPosition).toBeDefined();
            expect(result.postPosition).toBeDefined();

            // Verify positions expose bigint balances
            expect(typeof result.removedPosition.balance).toBe('bigint');
            expect(typeof result.postPosition.balance).toBe('bigint');
        });
    });

    it('allows add liquidity when AMM is dormant by deriving init price', () => {
        const userSetting = new UserSetting(0, 0, 3n * WAD);
        const addInput = new AddInput(fixtureTraderAddress, 1000n * WAD, -1000, 1000);

        const spotPrice = tickToWad(0);
        const setting: Setting = {
            ...fixtureSetting,
            initialMarginRatio: 1000,
            maintenanceMarginRatio: 500,
            param: {
                ...fixtureSetting.param,
                minMarginAmount: WAD,
            },
        };

        const onchainContext = new PairSnapshot({
            setting,
            condition: Condition.NORMAL,
            amm: {
                ...fixtureAmm,
                expiry: PERP_EXPIRY,
                status: Status.DORMANT,
                tick: 0,
                sqrtPX96: 0n,
            },
            priceData: {
                ...fixturePriceData,
                instrument: fixtureInstrumentAddress,
                expiry: PERP_EXPIRY,
                markPrice: 0n,
                spotPrice,
                benchmarkPrice: spotPrice,
            },
            portfolio: PairSnapshot.emptyPortfolio(),
            quoteState: fixtureQuoteState,
            spacing: {
                pearl: 1,
                order: 1,
                range: 1,
            },
            blockInfo: fixtureBlockInfo,
        });

        const [addParam] = addInput.simulate(onchainContext, userSetting);

        expect(addParam.tickDeltaLower).toBe(1000);
        expect(addParam.tickDeltaUpper).toBe(1000);
    });
});
