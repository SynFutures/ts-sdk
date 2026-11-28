const assert = require('node:assert/strict'),
    test = require('node:test');
const { createPublicClient, custom, encodeAbiParameters, decodeAbiParameters, parseAbiParameters } = require('viem');
const { mainnet, base } = require('viem/chains');
const { createOysterGovernanceClient, oysterTokens } = require('../dist/index.cjs');
const vault = '0x93432aFf5A44865Bd2cfC028C147AE1D0094cf05',
    account = '0x' + '12'.repeat(20);
test('Oyster routes transactions to its own deployment; Base has only a token default', () => {
    const transport = custom({
        request() {
            throw Error('unexpected RPC');
        },
    });
    const c = createOysterGovernanceClient(createPublicClient({ chain: mainnet, transport }));
    for (const [fn, selector] of [
        ['buildStake', 'a694fc3a'],
        ['buildUnstake', '2e17de78'],
        ['buildRelease', '37bdc99b'],
    ]) {
        assert.deepEqual(c[fn](0n), { to: vault, data: '0x' + selector + '0'.repeat(64) });
    }
    assert.equal(oysterTokens[8453].address, '0x2C24497D4086490e7EaD87CC12597fb50c2E6eD6');
    assert.throws(() => createOysterGovernanceClient(createPublicClient({ chain: base, transport })), /vault/);
});
test('one block-tagged aggregate retains original release indices after sorting', async () => {
    let count = 0;
    const transport = custom({
        request({ method, params }) {
            count++;
            assert.equal(method, 'eth_call');
            const [tx, block] = params;
            assert.equal(block, '0x0');
            assert.equal(tx.to.toLowerCase(), '0xca11bde05977b3631167028862be2a173976ca11');
            assert.equal(tx.data.slice(0, 10), '0x252dba42');
            const [calls] = decodeAbiParameters(
                parseAbiParameters('(address target,bytes callData)[]'),
                '0x' + tx.data.slice(10)
            );
            assert.deepEqual(
                calls.map((c) => c.target.toLowerCase()),
                [vault.toLowerCase(), vault.toLowerCase()]
            );
            assert.deepEqual(
                calls.map((c) => c.callData.slice(0, 10)),
                ['0x56b6861c', '0xe0805702']
            );
            return encodeAbiParameters(parseAbiParameters('uint256,bytes[]'), [
                0n,
                [
                    encodeAbiParameters(parseAbiParameters('uint256'), [60n]),
                    encodeAbiParameters(parseAbiParameters('uint128,(uint128,uint32)[]'), [
                        2n ** 100n,
                        [
                            [5n, 20],
                            [9n, 10],
                        ],
                    ]),
                ],
            ]);
        },
    });
    const c = createOysterGovernanceClient(createPublicClient({ chain: mainnet, transport }));
    assert.deepEqual(await c.getStakingInfo(account, { blockNumber: 0n }), {
        stakes: 2n ** 100n,
        pendingUnstakes: [
            { index: 1n, amount: 9n, createTime: 10n, releaseTime: 70n },
            { index: 0n, amount: 5n, createTime: 20n, releaseTime: 80n },
        ],
    });
    assert.equal(count, 1);
});
