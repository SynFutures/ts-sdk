import { scenarioReadOptions } from '../live/apiRpcParity/fixtures';

describe('live parity block selection', () => {
    test('pins RPC reads to the API context block by default', () => {
        expect(scenarioReadOptions({}, 123)).toEqual({ blockNumber: 123n });
    });

    test('preserves explicit block numbers without losing integer precision', () => {
        expect(scenarioReadOptions({ blockNumber: '9007199254740993' }, 123)).toEqual({
            blockNumber: 9007199254740993n,
        });
    });

    test('honors an explicit tag instead of the context block', () => {
        expect(scenarioReadOptions({ blockTag: 'pending' }, 123)).toEqual({ blockTag: 'pending' });
    });

    test('rejects conflicting or invalid block settings', () => {
        expect(() => scenarioReadOptions({ blockNumber: '1', blockTag: 'latest' }, 123)).toThrow('not both');
        expect(() => scenarioReadOptions({ blockNumber: '-1' }, 123)).toThrow('non-negative');
        expect(() => scenarioReadOptions({})).toThrow('valid block height');
    });
});
