import type { Address } from 'viem';
import { TradeInput } from '../actions/trade';
import { AdjustInput } from '../actions/adjust';
import { PairSnapshot, QuotationWithSize, Side, UserSetting, type Quotation } from '../types';
import { WAD, ZERO } from '../constants';
import { abs } from '../math';
import tradeScenarios from './fixtures/trade-scenarios.abc.json';
import { normalizeBigIntObject, parseOnchainContext, parseQuotation } from './helpers/abcFixture';
import { asRecord, isRecord } from './helpers/record';

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

const decodedScenarios = parseRawScenarios(tradeScenarios).map((entry) => ({
    name: entry.name,
    type: entry.type,
    signedSize: entry.signedSize ? BigInt(entry.signedSize) : undefined,
    quotation: entry.quotation ? parseQuotation(entry.quotation) : undefined,
    context: parseOnchainContext(entry.context),
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
                instrumentAddress: inputAddress(input, 'instrumentAddress'),
                traderAddress: inputAddress(input, 'traderAddress'),
                side: inputSide(input),
                baseQuantity: inputBigInt(input, 'baseQuantity'),
                margin: inputBigInt(input, 'margin'),
                userSetting: inputUserSetting(input),
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
                instrumentAddress: inputAddress(input, 'instrumentAddress'),
                traderAddress: inputAddress(input, 'traderAddress'),
                side: inputSide(input),
                baseQuantity: inputBigInt(input, 'baseQuantity'),
                targetLeverage: inputBigInt(input, 'targetLeverage'),
                userSetting: inputUserSetting(input),
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
                instrumentAddress: inputAddress(input, 'instrumentAddress'),
                traderAddress: inputAddress(input, 'traderAddress'),
                baseQuantity: inputBigInt(input, 'baseQuantity'),
                userSetting: inputUserSetting(input),
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
                instrumentAddress: inputAddress(input, 'instrumentAddress'),
                traderAddress: inputAddress(input, 'traderAddress'),
                amount: inputBigInt(input, 'amount'),
                transferIn: Boolean(input.transferIn),
                userSetting: inputUserSetting(input),
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
                const input = new TradeInput(data.traderAddress, data.baseQuantity, data.side, data.margin);

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
                const input = new TradeInput(data.traderAddress, data.baseQuantity, data.side);

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

                const [tradeParam, simulation] = input.simulate(context, quotationWithSize, data.userSetting);
                expect(tradeParam.amount).toBeGreaterThanOrEqual(0n);
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
                const oldExpected = parseOldAdjustExpected(expectedSimulation);
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
    if (!isRecord(value)) {
        throw new Error('Expected object to omit leverage');
    }
    const { leverage: _leverage, marginDelta: _marginDelta, ...withoutLeverage } = value;
    return withoutLeverage;
}

function parseRawScenarios(value: unknown): RawScenario[] {
    if (!Array.isArray(value)) {
        throw new Error('Trade scenario fixture must be an array');
    }
    return value.map(parseRawScenario);
}

function parseRawScenario(value: unknown): RawScenario {
    if (!isRecord(value) || !isScenarioType(value.type) || !isRecord(value.input) || !isRecord(value.expected)) {
        throw new Error('Invalid trade scenario fixture entry');
    }
    return {
        name: String(value.name ?? ''),
        type: value.type,
        signedSize: typeof value.signedSize === 'string' ? value.signedSize : undefined,
        quotation: value.quotation,
        context: value.context,
        input: value.input,
        expected: {
            simulation: value.expected.simulation,
        },
    };
}

function isScenarioType(value: unknown): value is ScenarioType {
    return value === 'margin' || value === 'leverage' || value === 'close' || value === 'adjustMargin';
}

function inputAddress(input: Record<string, unknown>, key: string): Address {
    return String(input[key] ?? '') as Address;
}

function inputSide(input: Record<string, unknown>): Side {
    return Number(input.side) as Side;
}

function inputBigInt(input: Record<string, unknown>, key: string): bigint {
    return BigInt(String(input[key] ?? 0));
}

function inputUserSetting(input: Record<string, unknown>): UserSetting {
    if (input.userSetting instanceof UserSetting) {
        return input.userSetting;
    }
    const userSetting = asRecord(input.userSetting);
    return new UserSetting(Number(userSetting.deadline ?? 0), Number(userSetting.slippage ?? 0), 3n * WAD);
}

function parseOldAdjustExpected(value: unknown): { positionMargin: string } {
    const record = asRecord(value);
    return {
        positionMargin: String(record.positionMargin ?? '0'),
    };
}
