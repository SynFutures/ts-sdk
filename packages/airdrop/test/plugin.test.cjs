const assert = require('node:assert/strict');
const test = require('node:test');
const { createPublicClient, custom } = require('viem');
const { mainnet, base } = require('viem/chains');
const { createAirdropClient, airdropAbi } = require('../dist/index.cjs');
const account = '0x' + '12'.repeat(20),
    leaf = '0x' + '34'.repeat(32);
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
test('constructs the original claim bytes on both deployments without invoking RPC', () => {
    const args = { account, index: 0n, amount: 2n ** 200n, proof: [leaf] };
    for (const [chain, to] of [
        [mainnet, '0xAeACfdb15284bDf93155C3616CC4a65C2C93EdFC'],
        [base, '0x2e28798f592392B1A1A735D405D43DDF327634F2'],
    ]) {
        const client = createAirdropClient(
            createPublicClient({
                chain,
                transport: custom({
                    request() {
                        throw Error('unexpected RPC');
                    },
                }),
            })
        );
        assert.deepEqual(client.buildClaim(args), {
            to,
            data: '0x2e7ba6ef' + word(0) + word(account) + word(args.amount) + word(128) + word(1) + leaf.slice(2),
        });
    }
    const client = createAirdropClient(
        createPublicClient({
            transport: custom({
                request() {
                    throw Error('unexpected RPC');
                },
            }),
        })
    );
    assert.throws(() => client.buildClaim(args), /distributor/);
    assert.equal(client.buildClaim({ ...args, distributor: account }).to, account);
    assert.ok(airdropAbi.some((x) => x.name === 'Claimed'));
});
test('isClaimed passes an explicit distributor and block zero through eth_call', async () => {
    const client = createAirdropClient(
        createPublicClient({
            chain: mainnet,
            transport: custom({
                request({ method, params }) {
                    assert.equal(method, 'eth_call');
                    assert.equal(params[0].to, account);
                    assert.equal(params[0].data, '0x9e34070f' + word(0));
                    assert.equal(params[1], '0x0');
                    return '0x' + word(1);
                },
            }),
        })
    );
    assert.equal(await client.isClaimed(0n, { distributor: account, blockNumber: 0n }), true);
});
