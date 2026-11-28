const assert = require('node:assert/strict');
const test = require('node:test');
const { GovernanceDataSource } = require('../dist/index.cjs');
const hash = '0x' + 'ab'.repeat(32),
    account = '0x' + 'AB'.repeat(20);
const event = {
    id: 'a',
    account,
    name: 'Unstake',
    args: '{"amount":"15"}',
    timestamp: '22',
    blockNumber: '9007199254740993',
    logIndex: 1,
    transaction: { id: hash },
};
function client(handler) {
    return new GovernanceDataSource('https://example.invalid', async (_url, request) =>
        Response.json(handler(JSON.parse(request.body)))
    );
}
test('history pages preserve filters, timestamp zero, log order and uint precision', async () => {
    const graph = client(({ variables: { where, first, skip, order } }) => {
        assert.deepEqual(where.account_in, [account.toLowerCase()]);
        assert.deepEqual(where.name_in, ['Unstake']);
        if (first === 2) {
            assert.equal(skip, 6);
            assert.equal(where.timestamp_lt, '0');
        }
        assert.equal(order, 'timestamp');
        return { data: { transactionEvents: [event, { ...event, id: 'b', logIndex: 2 }] } };
    });
    const rows = await graph.getHistoryEvents({
        accounts: [account],
        eventNames: ['Unstake'],
        size: 2,
        page: 3,
        endTs: 0,
    });
    assert.deepEqual(
        rows.map((r) => r.id),
        ['b', 'a']
    );
    assert.equal(rows[0].blockNumber, 9007199254740993n);
    assert.equal(await graph.getLastUnstakeTime(account), 22);
});
test('all pages use a stable ID cursor; withdrawal amounts remain lossless', async () => {
    let calls = 0;
    const graph = client(({ variables: { where, first } }) => {
        assert.equal(where.staker_.id, account.toLowerCase());
        assert.equal(where.status, 'PENDING');
        const row = { amount: '9007199254740993000', pendingIndex: '0', transaction: { id: hash } };
        if (calls++ === 0) {
            assert.equal(where.id_gt, '');
            return {
                data: {
                    pendingUnstakes: Array.from({ length: first }, (_, i) => ({
                        ...row,
                        id: String(i).padStart(4, '0'),
                    })),
                },
            };
        }
        assert.equal(where.id_gt, '0999');
        return { data: { pendingUnstakes: [{ ...row, id: '1000' }] } };
    });
    const rows = await graph.getCurrentPendingUnstakes(account);
    assert.equal(rows.length, 1001);
    assert.deepEqual(rows[1000], { amount: 9007199254740993000n, pendingIndex: 0n, txHash: hash });
});
test('rejects GraphQL errors and malformed event data', async () => {
    await assert.rejects(
        client(() => ({ errors: [{ message: 'indexing error' }] })).getHistoryEvents(),
        /indexing error/
    );
    await assert.rejects(
        client(() => ({ data: { transactionEvents: [{ ...event, blockNumber: '1.5' }] } })).getHistoryEvents(),
        /integer/
    );
});
