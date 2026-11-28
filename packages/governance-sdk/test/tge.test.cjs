const assert = require('node:assert/strict'),
    test = require('node:test');
const { createHash } = require('node:crypto');
const { createPublicClient, custom, encodeAbiParameters, encodeFunctionData, parseAbiParameters } = require('viem');
const { mainnet, sepolia, base } = require('viem/chains');
const { createGovernanceClient, governanceVaultAbi } = require('../dist/index.cjs');
const { createTgeClient } = require('../dist/tge.cjs');
const vault = '0xB02585D7d561Cf3469CCDC4447a63C3F4dB8d7D8',
    token = '0x91DcdBa5032657D5573036fEf15724deF8CD2316',
    account = '0x' + '11'.repeat(20),
    customVault = '0x' + '22'.repeat(20),
    multi = '0x' + '33'.repeat(20);
test('independent root retains Ethereum and Sepolia addresses and the uint256 vault ABI', async () => {
    assert.equal(
        createHash('sha256').update(JSON.stringify(governanceVaultAbi)).digest('hex'),
        '84eb84cb70112f3c77ae4106c363f9e325df89d1e6bc52e060ffe752a6e521fc'
    );
    const transport = custom({
        request({ method, params }) {
            assert.equal(method, 'eth_call');
            assert.equal(params[0].to.toLowerCase(), '0xca11bde05977b3631167028862be2a173976ca11');
            assert.equal(params[1], '0x9');
            return encodeAbiParameters(parseAbiParameters('uint256,bytes[]'), [
                9n,
                [
                    encodeAbiParameters(parseAbiParameters('uint256'), [60n]),
                    encodeAbiParameters(parseAbiParameters('uint256,(uint128,uint32)[]'), [2n ** 200n, [[7n, 10]]]),
                ],
            ]);
        },
    });
    for (const chain of [mainnet, sepolia]) {
        const client = createGovernanceClient(createPublicClient({ chain, transport }));
        assert.equal(client.token, token);
        assert.equal(client.buildStake(1n).to, vault);
        const info = await client.getStakingInfo(account, { blockNumber: 9n });
        assert.equal(info.stakes, 2n ** 200n);
        assert.equal(info.pendingUnstakes[0].releaseTime, 70n);
    }
    assert.throws(() => createGovernanceClient(createPublicClient({ chain: base, transport })), /deployment/);
});
test('TGE always honors caller deployment, builds offline and estimates without attaching a sender', async () => {
    const calls = [];
    const pub = createPublicClient({
        chain: mainnet,
        transport: custom({
            request({ method, params }) {
                assert.equal(method, 'eth_estimateGas');
                calls.push(params[0]);
                return '0x186a0';
            },
        }),
    });
    const tge = createTgeClient(pub, { vault: customVault, multicall: multi, graphUrl: 'https://example.invalid' });
    const claim = tge.airdrop.buildClaim({ distributor: account, index: 1n, account, amount: 2n, proof: [] });
    assert.equal(claim.to, account);
    assert.equal(claim.data.slice(0, 10), '0x2e7ba6ef');
    assert.throws(() => tge.airdrop.buildClaim({ index: 1n, account, amount: 2n, proof: [] }), /explicit distributor/);
    const tx = tge.governance.buildRelease(0n);
    assert.equal(tx.to, customVault);
    assert.equal(calls.length, 0);
    for (const [gasMultiplier, expected] of [
        [1.001, 101000n],
        [1.1, 110000n],
        [1, 100000n],
    ]) {
        assert.deepEqual(await tge.estimateRequest(tx, { account, gasMultiplier }), { ...tx, gas: expected });
        assert.equal(calls.at(-1).from, account);
    }
    assert.deepEqual(await tge.estimateRequest(tx, { gas: 0n }), { ...tx, gas: 0n });
    assert.equal(calls.length, 3);
    assert.equal(createTgeClient(pub).governance, undefined);
});

test('TGE reads the total staked from its configured vault at the requested block', async () => {
    const totalStaked = 2n ** 100n;
    const publicClient = createPublicClient({
        chain: mainnet,
        transport: custom({
            request({ method, params }) {
                assert.equal(method, 'eth_call');
                assert.equal(params[0].to, customVault);
                assert.equal(
                    params[0].data,
                    encodeFunctionData({ abi: governanceVaultAbi, functionName: 'totalStaking' })
                );
                assert.equal(params[1], '0x9');
                return encodeAbiParameters(parseAbiParameters('uint128'), [totalStaked]);
            },
        }),
    });
    const tge = createTgeClient(publicClient, {
        vault: customVault,
        multicall: multi,
        graphUrl: 'https://example.invalid',
    });

    assert.equal(await tge.governance.getTotalStaking({ blockNumber: 9n }), totalStaked);
});
