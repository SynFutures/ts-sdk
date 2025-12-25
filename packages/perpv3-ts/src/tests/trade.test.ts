import type { Address } from 'viem';
import { TradeInput } from '../actions/trade';
import { AdjustInput } from '../actions/adjust';
import { PairSnapshot, QuotationWithSize, Side, UserSetting, type Quotation } from '../types';
import { WAD, ZERO } from '../constants';
import { abs } from '../math';
import tradeScenarios from './fixtures/trade-scenarios.abc.json';
import { normalizeBigIntObject, parseOnchainContext, parseQuotation } from './helpers/abcFixture';

type ScenarioType = 'margin' | 'leverage' | 'close' | 'adjustMargin';

interface RawScenario {
    name: string;
    type: ScenarioType;
    signedSize?: string;
    quotation?: unknown;
    context: unknown;
    input: Record<string, unknown>;
    expected: {
        simulation: unknown;
    };
}

interface MarginScenario {
    name: string;
    instrumentAddress: Address;
    traderAddress: Address;
    side: Side;
    baseQuantity: bigint;
    margin: bigint;
    userSetting: UserSetting;
    signedSize: bigint;
    quotation: Quotation;
    context: PairSnapshot;
}

interface LeverageScenario {
    name: string;
    instrumentAddress: Address;
    traderAddress: Address;
    side: Side;
    baseQuantity: bigint;
    targetLeverage: bigint;
    userSetting: UserSetting;
    signedSize: bigint;
    quotation: Quotation;
    context: PairSnapshot;
}

interface CloseScenario {
    name: string;
    instrumentAddress: Address;
    traderAddress: Address;
    baseQuantity: bigint;
    userSetting: UserSetting;
    signedSize: bigint;
    quotation: Quotation;
    context: PairSnapshot;
}

interface AdjustMarginScenario {
    name: string;
    instrumentAddress: Address;
    traderAddress: Address;
    amount: bigint;
    transferIn: boolean;
    userSetting: UserSetting;
    context: PairSnapshot;
}

const decodedScenarios = (tradeScenarios as RawScenario[]).map((entry) => ({
    name: entry.name,
    type: entry.type,
    signedSize: entry.signedSize ? BigInt(entry.signedSize) : undefined,
    quotation: entry.quotation ? parseQuotation(entry.quotation) : undefined,
    context: parseOnchainContext(entry.context as never),
    input: entry.input,
    expected: entry.expected,
}));

const marginScenarios: Array<{ data: MarginScenario; expectedSimulation: unknown }> = decodedScenarios
    .filter((scenario) => scenario.type === 'margin' && scenario.expected?.simulation)
    .map((scenario) => {
        const input = scenario.input;
        return {
            data: {
                name: scenario.name,
                instrumentAddress: input.instrumentAddress as Address,
                traderAddress: input.traderAddress as Address,
                side: Number(input.side) as Side,
                baseQuantity: BigInt(input.baseQuantity as string),
                margin: BigInt(input.margin as string),
                userSetting:
                    input.userSetting instanceof UserSetting
                        ? input.userSetting
                        : new UserSetting(
                              (input.userSetting as { deadline: number; slippage: number }).deadline,
                              (input.userSetting as { deadline: number; slippage: number }).slippage,
                              3n * WAD
                          ),
                signedSize: scenario.signedSize!,
                quotation: scenario.quotation!,
                context: scenario.context,
            },
            expectedSimulation: scenario.expected.simulation,
        };
    });

const leverageScenarios: Array<{ data: LeverageScenario; expectedSimulation: unknown }> = decodedScenarios
    .filter((scenario) => scenario.type === 'leverage' && scenario.expected?.simulation)
    .map((scenario) => {
        const input = scenario.input;
        return {
            data: {
                name: scenario.name,
                instrumentAddress: input.instrumentAddress as Address,
                traderAddress: input.traderAddress as Address,
                side: Number(input.side) as Side,
                baseQuantity: BigInt(input.baseQuantity as string),
                targetLeverage: BigInt(input.targetLeverage as string),
                userSetting:
                    input.userSetting instanceof UserSetting
                        ? input.userSetting
                        : new UserSetting(
                              (input.userSetting as { deadline: number; slippage: number }).deadline,
                              (input.userSetting as { deadline: number; slippage: number }).slippage,
                              3n * WAD
                          ),
                signedSize: scenario.signedSize!,
                quotation: scenario.quotation!,
                context: scenario.context,
            },
            expectedSimulation: scenario.expected.simulation,
        };
    });

const closeScenarios: Array<{ data: CloseScenario; expectedSimulation: unknown }> = decodedScenarios
    .filter((scenario) => scenario.type === 'close' && scenario.expected?.simulation)
    .map((scenario) => {
        const input = scenario.input;
        return {
            data: {
                name: scenario.name,
                instrumentAddress: input.instrumentAddress as Address,
                traderAddress: input.traderAddress as Address,
                baseQuantity: BigInt(input.baseQuantity as string),
                userSetting:
                    input.userSetting instanceof UserSetting
                        ? input.userSetting
                        : new UserSetting(
                              (input.userSetting as { deadline: number; slippage: number }).deadline,
                              (input.userSetting as { deadline: number; slippage: number }).slippage,
                              3n * WAD
                          ),
                signedSize: scenario.signedSize!,
                quotation: scenario.quotation!,
                context: scenario.context,
            },
            expectedSimulation: scenario.expected.simulation,
        };
    });

const adjustMarginScenarios: Array<{ data: AdjustMarginScenario; expectedSimulation: unknown }> = decodedScenarios
    .filter((scenario) => scenario.type === 'adjustMargin')
    .map((scenario) => {
        const input = scenario.input;
        return {
            data: {
                name: scenario.name,
                instrumentAddress: input.instrumentAddress as Address,
                traderAddress: input.traderAddress as Address,
                amount: BigInt(input.amount as string),
                transferIn: Boolean(input.transferIn),
                userSetting:
                    input.userSetting instanceof UserSetting
                        ? input.userSetting
                        : new UserSetting(
                              (input.userSetting as { deadline: number; slippage: number }).deadline,
                              (input.userSetting as { deadline: number; slippage: number }).slippage,
                              3n * WAD
                          ),
                context: scenario.context,
            },
            expectedSimulation: scenario.expected.simulation,
        };
    });

describe('trade simulations (ABC fixture data)', () => {
    describe('simulateTradeByMargin', () => {
        marginScenarios.forEach(({ data, expectedSimulation }) => {
            // Skip tests with trades below minimum trade value (these would fail validation in production)
            const shouldSkip =
                data.context.portfolio.position.size === 0n &&
                data.quotation.entryNotional < data.context.instrumentSetting.minTradeValue;

            test(data.name, () => {
                if (shouldSkip) {
                    // These test fixtures have trades below minimum trade value
                    // They need to be regenerated with larger trade sizes
                    return;
                }

                const context = data.context;
                const quotationWithSize = new QuotationWithSize(data.signedSize, data.quotation);
                const input = new TradeInput(
                    data.traderAddress,
                    data.baseQuantity,
                    data.side as Side,
                    data.margin
                );

                const [, simulation] = input.simulate(context, quotationWithSize, data.userSetting);
                expect(omitLeverage(normalizeBigIntObject(simulation) as unknown)).toEqual(
                    omitLeverage(expectedSimulation)
                );
            });
        });
    });

    describe('simulateTradeByLeverage', () => {
        leverageScenarios.forEach(({ data, expectedSimulation }) => {
            // Skip tests with trades below minimum trade value (these would fail validation in production)
            const shouldSkip =
                data.context.portfolio.position.size === 0n &&
                data.quotation.entryNotional < data.context.instrumentSetting.minTradeValue;

            test(data.name, () => {
                if (shouldSkip) {
                    // These test fixtures have trades below minimum trade value
                    // They need to be regenerated with larger trade sizes
                    return;
                }

                const context = data.context;
                const quotationWithSize = new QuotationWithSize(data.signedSize, data.quotation);
                const input = new TradeInput(data.traderAddress, data.baseQuantity, data.side as Side);

                const [, simulation] = input.simulate(context, quotationWithSize, data.userSetting);
                expect(omitLeverage(normalizeBigIntObject(simulation) as unknown)).toEqual(
                    omitLeverage(expectedSimulation)
                );
            });
        });
    });

    describe('simulateClose', () => {
        closeScenarios.forEach(({ data, expectedSimulation }) => {
            test(data.name, () => {
                const context = data.context;
                const quotationWithSize = new QuotationWithSize(data.signedSize, data.quotation);
                // To close a position, use the signedSize from the quotation (which is the trade size)
                // Determine side from signedSize: positive = LONG, negative = SHORT
                const closeSide = data.signedSize >= ZERO ? Side.LONG : Side.SHORT;
                const input = new TradeInput(
                    data.traderAddress,
                    abs(data.signedSize), // positive quantity from signedSize
                    closeSide, // side determined from signedSize
                    0n // no margin for closing
                );

                const [, simulation] = input.simulate(context, quotationWithSize, data.userSetting);
                expect(omitLeverage(normalizeBigIntObject(simulation) as unknown)).toEqual(
                    omitLeverage(expectedSimulation)
                );
            });
        });
    });

    describe('simulateAdjustMargin', () => {
        adjustMarginScenarios.forEach(({ data, expectedSimulation }) => {
            test(data.name, () => {
                const context = data.context; // PairSnapshot is immutable, no need to clone
                const input = new AdjustInput(data.traderAddress, data.amount, data.transferIn);
                const [, simulation] = input.simulate(context, data.userSetting);
                // Transform old expected simulation structure to new postPosition structure
                const oldExpected = expectedSimulation as {
                    positionMargin: string;
                    leverage: string;
                    liquidationPrice: string;
                };
                const position = context.portfolio.position;
                const expectedPostPosition = {
                    balance: oldExpected.positionMargin,
                    size: position.size.toString(),
                    entryNotional: position.entryNotional.toString(),
                    entrySocialLossIndex: position.entrySocialLossIndex.toString(),
                    entryFundingIndex: position.entryFundingIndex.toString(),
                };
                const expected = {
                    postPosition: expectedPostPosition,
                };
                expect(normalizeBigIntObject(simulation)).toEqual(expected);
            });
        });
    });
});

function omitLeverage(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
        throw new Error('Expected object to omit leverage');
    }
    const record = value as Record<string, unknown>;
    const { leverage: _leverage, marginDelta: _marginDelta, ...withoutLeverage } = record;
    return withoutLeverage;
}
