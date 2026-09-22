import type { Address } from 'viem';
import { TradeInput } from '../../actions/trade';
import { AdjustInput } from '../../actions/adjust';
import { QuotationWithSize, Side, UserSetting } from '../../types';
import { WAD } from '../../constants';
import scenarios from '../fixtures/trade-scenarios.json';
import { normalizeBigIntObject, parseOnchainContext, parseQuotation } from '../helpers/snapshotFixture';

function tradeInputs(scenario: (typeof scenarios.trades)[number]) {
    const { input } = scenario;
    const signedSize = BigInt(scenario.signedSize);
    const margin = input.margin === undefined ? undefined : BigInt(input.margin);
    return {
        input: new TradeInput(
            input.traderAddress as Address,
            BigInt(input.baseQuantity),
            signedSize > 0n ? Side.LONG : Side.SHORT,
            margin
        ),
        quotation: new QuotationWithSize(signedSize, parseQuotation(scenario.quotation)),
        settings: new UserSetting(
            input.userSetting.deadline,
            input.userSetting.slippage,
            input.targetLeverage === undefined ? 3n * WAD : BigInt(input.targetLeverage)
        ),
    };
}

// The 3x fixture needs one unit of margin plus 3 wei: tick-zero price rounds
// conservatively to WAD + 1, and the trade size is three base units.
describe('trade simulations with offline numerical fixtures', () => {
    test.each(scenarios.trades)('$name', (scenario) => {
        const snapshot = parseOnchainContext(scenario.context);
        const { input, quotation, settings } = tradeInputs(scenario);
        const [params, result] = input.simulate(snapshot, quotation, settings);

        expect(params.size).toBe(BigInt(scenario.signedSize));
        expect(params.amount).toBe(BigInt(scenario.expected.amount));
        expect(normalizeBigIntObject(result)).toEqual(scenario.expected.simulation);
    });

    test.each(scenarios.trades.slice(0, 2))('rejects $name below the market minimum', (scenario) => {
        const context = structuredClone(scenario.context);
        context.setting.param.minMarginAmount = (100n * WAD).toString();
        const snapshot = parseOnchainContext(context);
        const { input, quotation, settings } = tradeInputs(scenario);

        expect(() => input.simulate(snapshot, quotation, settings)).toThrow('Trade value below minimum trade value');
    });

    test('adds margin while preserving the position size and entry values', () => {
        const { input, context, expected } = scenarios.marginAdjustment;
        const snapshot = parseOnchainContext(context);
        const adjustment = new AdjustInput(input.traderAddress as Address, BigInt(input.amount), input.transferIn);
        const settings = new UserSetting(input.userSetting.deadline, input.userSetting.slippage, 3n * WAD);
        const [params, result] = adjustment.simulate(snapshot, settings);

        expect(params.net).toBe(BigInt(expected.net));
        expect(normalizeBigIntObject(result)).toEqual(expected.simulation);
    });
});

describe('trade quotation identity', () => {
    test.each([2n, -1n, 0n])('rejects quotation size multiplied by %s', (factor) => {
        const scenario = scenarios.trades[0];
        const { input, settings } = tradeInputs(scenario);
        const quotation = new QuotationWithSize(
            BigInt(scenario.signedSize) * factor,
            parseQuotation(scenario.quotation)
        );
        expect(() => input.simulate(parseOnchainContext(scenario.context), quotation, settings)).toThrow(
            'Quotation size and direction must match the trade input'
        );
    });
});
