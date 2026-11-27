const assert = require('node:assert/strict');
const test = require('node:test');
const { governanceDataSourcePlugin } = require('../build');

test('governance history supports filtered pages, cursor queries and pending withdrawals', async () => {
    const { governanceDataSource: graph } = governanceDataSourcePlugin('https://example.invalid').install({});
    const event = { id: 'event', name: 'Unstake', account: '0xabc', args: '{"amount":"15"}',
        timestamp: '22', blockNumber: '5', logIndex: '1', transaction: { id: 'tx' } };
    graph.query = async (query, skip, first) => {
        assert.match(query, /name_in: \["Unstake"\]/);
        assert.match(query, /account_in: \["0xabc"\]/);
        assert.match(query, /orderBy: timestamp, orderDirection: desc/);
        if (first === 2) {
            assert.equal(skip, 6);
            assert.match(query, /timestamp_gte: 10,timestamp_lt: 30/);
        } else {
            assert.equal(first, 1);
            assert.equal(skip, 0);
        }
        return { transactionEvents: [event] };
    };
    const [row] = await graph.getHistoryEvents({ accounts: ['0xABC'], eventNames: ['Unstake'],
        startTs: 10, endTs: 30, page: 3, size: 2 });
    assert.equal(row.txHash, 'tx');
    assert.deepEqual(row.args, { amount: '15' });
    assert.equal(await graph.getLastUnstakeTime('0xABC'), 22);
    graph.queryAll = async (query, pageSize, byId) => {
        assert.ok(pageSize > 0);
        assert.equal(byId, true);
        assert.match(query, /id_gt: \$lastID/);
        if (query.includes('pendingUnstakes(')) {
            assert.match(query, /status:PENDING,staker_:\{id:"0xabc"\}/);
            return [{ pendingIndex: '0', amount: '15', transaction: { id: 'tx' } }];
        }
        assert.match(query, /name_in: \["Stake","Unstake","Release"\]/);
        return [event, { ...event, id: 'later', logIndex: '2' }];
    };
    assert.deepEqual((await graph.getHistoryEvents({})).map(e => e.id), ['later', 'event']);
    const [pending] = await graph.getCurrentPendingUnstakes('0xABC');
    assert.equal(pending.pendingIndex, 0);
    assert.equal(pending.amount.toString(), '15');
    assert.equal(pending.txHash, 'tx');
});
