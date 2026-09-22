import { scenarioReadOptions } from '../live/apiRpcParity/fixtures';
import { compareTradeResults } from '../live/apiRpcParity/assertions';
import { simulateScenario } from '../live/apiRpcParity/runners';
import type { MarketByLeverageScenario } from '../live/apiRpcParity/types';
import scenarios from '../fixtures/trade-scenarios.json';
import { parseOnchainContext, parseQuotation } from '../helpers/snapshotFixture';
import { UserSetting } from '../../types';

test('pins RPC reads to the API snapshot and rejects conflicting overrides', () => {
    expect(scenarioReadOptions({}, 123)).toEqual({ blockNumber: 123n });
    expect(scenarioReadOptions({ blockNumber: '123' }, 123)).toEqual({ blockNumber: 123n });
    expect(() => scenarioReadOptions({ blockNumber: '124' }, 123)).toThrow('must match');
    expect(() => scenarioReadOptions({ blockTag: 'pending' }, 123)).toThrow('moving block tag');
    expect(() => scenarioReadOptions({})).toThrow('valid block height');
});

test('a funding index difference fails parity instead of being overwritten', () => {
    const api = { postPosition: { entryFundingIndex: 1n, size: 2n } };
    const rpc = { postPosition: { entryFundingIndex: 3n, size: 2n } };
    expect(() => compareTradeResults(api, rpc)).toThrow();
    expect(rpc.postPosition.entryFundingIndex).toBe(3n);
});

test('marketByLeverage applies the scenario leverage instead of the base default', () => {
    const fixture = scenarios.trades[1];
    const snapshot = parseOnchainContext(fixture.context).with({ quotation: parseQuotation(fixture.quotation) });
    const scenario: MarketByLeverageScenario = {
        type: 'marketByLeverage',
        chainId: 8453,
        expiry: snapshot.expiry,
        instrumentAddress: snapshot.instrumentAddress,
        traderAddress: '0x0000000000000000000000000000000000001001',
        userSetting: { deadline: 3600, slippage: 0 },
        input: { baseQuantity: fixture.input.baseQuantity, side: 'LONG', targetLeverage: '3000000000000000000' },
    };
    expect(simulateScenario(scenario, snapshot, new UserSetting(3600, 0, 5n * 10n ** 18n))).toMatchObject([
        { amount: BigInt(fixture.expected.amount) },
        { postPosition: { balance: BigInt(fixture.expected.simulation.postPosition.balance) } },
    ]);
});
