const assert = require('node:assert/strict');
const test = require('node:test');
const { BigNumber, constants, providers, utils } = require('ethers');
const { Multicall3__factory } = require('@derivation-tech/web3-core');
const legacy = require('../build');
const { createTgeClient, ActionType, simulateNextDayVotingPower } = require('../tge');

const account = '0x0000000000000000000000000000000000000001';
const vault = '0x0000000000000000000000000000000000000002';
const multicall = '0x0000000000000000000000000000000000000003';
const proof = [utils.id('leaf')];
const config = { vault, multicall, graphUrl: 'https://graph.invalid' };
const stakeAbi = legacy.SynFuturesStakingVault__factory.createInterface();
const dropAbi = new utils.Interface([
    'function claim(uint256,address,uint256,bytes32[])',
    'function isClaimed(uint256) view returns(bool)',
]);
const multiAbi = Multicall3__factory.createInterface();

function providerWith(handler) {
    return new providers.Web3Provider(
        {
            request: async ({ method, params }) => {
                if (method === 'eth_chainId') return '0x1';
                return handler(method, params);
            },
        },
        1
    );
}

test('claim status and four unsigned methods preserve calldata, sender and gas estimation', async () => {
    const estimates = [];
    const provider = providerWith((method, params) => {
        if (method === 'eth_call') {
            assert.equal(params[1], '0x9');
            assert.equal(params[0].data, dropAbi.encodeFunctionData('isClaimed', [0]));
            return dropAbi.encodeFunctionResult('isClaimed', [true]);
        }
        assert.equal(method, 'eth_estimateGas');
        estimates.push(params[0]);
        return '0x65';
    });
    const { airdrop, governance } = createTgeClient(provider, 1.7, config);
    assert.ok(await airdrop.isClaimed(vault, 0, { blockTag: 9 }));
    const claim = await airdrop.claim(vault, 0, 123, account, proof);
    assert.equal(claim.data, dropAbi.encodeFunctionData('claim', [0, account, 123, proof]));
    assert.equal(claim.from, undefined);
    assert.equal(estimates[0].from, undefined);
    assert.equal(claim.gasLimit.toString(), '171');
    for (const method of ['stake', 'unstake', 'release']) {
        const tx = await governance[method](3, { from: account });
        assert.equal(tx.to, vault);
        assert.equal(tx.data, stakeAbi.encodeFunctionData(method, [3]));
        assert.equal(estimates.at(-1).from, account);
        assert.equal(tx.from, undefined);
        assert.equal(tx.gasLimit.toString(), '171');
    }
    const explicit = await governance.stake(1, { from: account, gasLimit: 222 });
    assert.equal(explicit.from, undefined);
    assert.equal(explicit.gasLimit.toString(), '222');
    const skipped = await governance.unstake(1, { from: account, disableGasLimit: true });
    assert.equal(skipped.from, undefined);
    assert.equal(skipped.gasLimit, undefined);
    assert.equal(estimates.length, 4);
    assert.deepEqual(Object.keys(createTgeClient(provider)), ['airdrop']);
});

test('gas multipliers round positive fractional hundredths upward', async () => {
    const provider = providerWith((method) => {
        assert.equal(method, 'eth_estimateGas');
        return '0x186a0'; // 100,000 gas
    });
    const { airdrop, governance } = createTgeClient(provider, 1.001, config);
    const claim = await airdrop.claim(vault, 0, 1, account, proof);
    assert.equal(claim.gasLimit.toString(), '101000');
    const stake = await governance.stake(1, { gasLimitMultiple: 0.001 });
    assert.equal(stake.gasLimit.toString(), '1000');
});

test('a 1.1 multiplier stays at 110 hundredths and from stays off the transaction', async () => {
    const estimates = [];
    const provider = providerWith((method, params) => {
        assert.equal(method, 'eth_estimateGas');
        estimates.push(params[0]);
        return '0x65';
    });
    const { airdrop, governance } = createTgeClient(provider, 1.1, config);
    const claim = await airdrop.claim(vault, 0, 123, account, proof, { from: account });
    const stake = await governance.stake(3, { from: account });
    assert.equal(claim.from, undefined);
    assert.equal(stake.from, undefined);
    assert.equal(estimates[0].from, account);
    assert.equal(estimates[1].from, account);
    assert.equal(claim.gasLimit.toString(), '111');
    assert.equal(stake.gasLimit.toString(), '111');
});

test('one block-tagged aggregate preserves original release indices when sorting', async () => {
    let reads = 0;
    const provider = providerWith((method, [tx, tag]) => {
        assert.equal(method, 'eth_call');
        if (tx.to === vault) {
            assert.equal(tx.data, stakeAbi.encodeFunctionData('totalStaking'));
            return stakeAbi.encodeFunctionResult('totalStaking', [77]);
        }
        reads++;
        assert.equal(tx.to, multicall);
        assert.equal(tag, '0x11');
        const [calls] = multiAbi.decodeFunctionData('aggregate', tx.data);
        assert.deepEqual(
            calls.map((call) => call.callData),
            [stakeAbi.encodeFunctionData('pendingDuration'), stakeAbi.encodeFunctionData('accountStakeInfo', [account])]
        );
        return multiAbi.encodeFunctionResult('aggregate', [
            17,
            [
                stakeAbi.encodeFunctionResult('pendingDuration', [50]),
                stakeAbi.encodeFunctionResult('accountStakeInfo', [
                    91,
                    [
                        [3, 20],
                        [4, 10],
                    ],
                ]),
            ],
        ]);
    });
    const { governance } = createTgeClient(provider, 1.7, config);
    const info = await governance.getStakingInfo(account, { blockTag: 17 });
    assert.equal(reads, 1);
    assert.equal(info.stakes.toString(), '91');
    assert.deepEqual(
        info.pendingUnstakes.map((p) => [p.index, p.amount.toString(), p.createTime, p.releaseTime]),
        [
            [1, '4', 10, 60],
            [0, '3', 20, 70],
        ]
    );
    assert.equal((await governance.stakingVault.totalStaking()).toString(), '77');
});

test('history follows the cursor, returns newest log first and retains pending contract indices', async () => {
    const graph = new legacy.GovGraph(config.graphUrl);
    const calls = [];
    const entry = (i) => ({
        id: String(i).padStart(6, '0'),
        name: 'Stake',
        account,
        args: '{"amount":"3"}',
        logIndex: String(i),
        blockNumber: '7',
        timestamp: '25',
        transaction: { id: 'hash' + i },
    });
    graph.query = async (query, skip, first, lastID) => {
        calls.push({ query, skip, first, lastID });
        if (query.includes('pendingUnstakes('))
            return { pendingUnstakes: [{ id: 'a', pendingIndex: '8', amount: '13', transaction: { id: 'h' } }] };
        if (first === 1) return { transactionEvents: [] };
        return { transactionEvents: lastID ? [entry(1000)] : Array.from({ length: 1000 }, (_, i) => entry(i)) };
    };
    const events = await graph.getHistoryEvents({ accounts: [account] });
    assert.equal(events.length, 1001);
    assert.equal(events[0].logIndex, 1000);
    assert.equal(events[0].args.amount, '3');
    assert.equal(calls[1].lastID, '000999');
    assert.match(calls[0].query, /id_gt: \$lastID/);
    assert.equal(await graph.getLastUnstakeTime(account), 0);
    assert.equal(calls.at(-1).first, 1);
    assert.match(calls.at(-1).query, /orderBy: timestamp/);
    await graph.getHistoryEvents({ page: 2, size: 1, accounts: [account] });
    assert.equal(calls.at(-1).skip, 2);
    const [pending] = await graph.getCurrentPendingUnstakes(account);
    assert.deepEqual([pending.pendingIndex, pending.txHash, pending.amount.toString()], [8, 'h', '13']);
});

test('the released signer API and all legacy deep imports remain intact', async () => {
    const previous = require('governance-sdk-legacy');
    assert.deepEqual(Object.keys(legacy).sort(), Object.keys(previous).sort());
    const fs = require('node:fs'),
        path = require('node:path');
    const root = path.dirname(require.resolve('governance-sdk-legacy/package.json'));
    for (const file of fs.readdirSync(path.join(root, 'build'), { recursive: true })) {
        if (!file.endsWith('.js') && !file.endsWith('.d.ts')) continue;
        assert.deepEqual(
            fs.readFileSync(path.join(__dirname, '../build', file), 'utf8'),
            fs
                .readFileSync(path.join(root, 'build', file), 'utf8')
                .replaceAll('@derivation-tech/web3-core', file.includes(path.sep) ? '../legacy-core' : './legacy-core')
                .replace(/(['"])(ethers|@ethersproject\/providers)\1/g, (_, quote, name) => {
                    const link = path.relative(path.dirname(file), path.join('v5', name)).split(path.sep).join('/');
                    return quote + (link.startsWith('.') ? link : './' + link) + quote;
                }),
            file
        );
    }
    const signer = {};
    const tx = { data: '0x1234' };
    const receipt = { status: 1 };
    const client = Object.create(legacy.GovClient.prototype);
    client.stakingVault = {
        populateTransaction: { stake: async () => tx, unstake: async () => tx, release: async () => tx },
    };
    client.ctx = {
        sendTx: async (s, t) => {
            assert.equal(s, signer);
            assert.equal(t, tx);
            return receipt;
        },
    };
    for (const op of ['stake', 'unstake', 'release'])
        assert.equal(await client[op](signer, BigNumber.from(2)), receipt);
});

test('voting power handles zero, rounded increments, caps and UTC midnight', (t) => {
    const now = Date.UTC(2025, 0, 3);
    t.mock.method(Date, 'now', () => now);
    const W = utils.parseEther,
        zero = constants.Zero;
    const settings = { minThreshold: W('1'), baselineAmount: W('2'), maxPowerBoost: 3 };
    const power = (previous, ts, stake, action, amount) =>
        simulateNextDayVotingPower(previous, ts, stake, action, amount, settings);
    assert.ok(power(W('10'), 0, zero, ActionType.HODL, zero).isZero());
    assert.ok(power(W('2'), now / 1000, W('2'), ActionType.HODL, zero).eq(W('2')));
    assert.ok(power(W('2'), now / 1000 - 1, W('2'), ActionType.HODL, zero).eq(W('4')));
    assert.ok(power(W('100'), 0, W('2'), ActionType.HODL, zero).eq(W('6')));
    assert.ok(power(W('2'), 0, W('2'), ActionType.UNSTAKE, W('1.5')).isZero());
});

test('an installed v5 host and the governance root share their chain context', () => {
    const { ChainContext } = require('@derivation-tech/web3-core');
    assert.equal(legacy.GovClient.getInstance('ethereum').ctx, ChainContext.getInstance('ethereum'));
});

test('standalone core keeps the OP provider and gas oracle call on the supplied transport', async (t) => {
    const { ChainContext } = require('../build/legacy-core/standalone');
    // The legacy OP context constructs its first provider before setProvider can replace it.
    // Keep both its initial RPC and any optional WebSocket independent of the developer environment.
    const { BASE_RPC, BASE_WSS } = process.env;
    t.after(() => {
        if (BASE_RPC === undefined) delete process.env.BASE_RPC;
        else process.env.BASE_RPC = BASE_RPC;
        if (BASE_WSS === undefined) delete process.env.BASE_WSS;
        else process.env.BASE_WSS = BASE_WSS;
    });
    process.env.BASE_RPC = 'http://127.0.0.1:1';
    delete process.env.BASE_WSS;
    const ctx = ChainContext.getInstance('base');
    const endpoint = new providers.JsonRpcProvider(undefined, 8453);
    let calls = 0;
    endpoint.call = async (tx) => {
        assert.equal((await tx.to).toLowerCase(), '0x420000000000000000000000000000000000000f');
        assert.equal(await tx.data, utils.id('l1BaseFee()').slice(0, 10));
        calls++;
        return utils.defaultAbiCoder.encode(['uint256'], [42]);
    };
    ctx.setProvider(endpoint);
    assert.equal((await ctx.provider.getL1GasPrice()).toString(), '42');
    assert.equal(calls, 1);
});

test('standalone v5 WebSocketProvider reads a block through the installed ws transport', async () => {
    const { once } = require('node:events');
    const { WebSocketServer } = require('ws');
    const { WebSocketProvider } = require('../build/v5/@ethersproject/providers');
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    server.on('connection', (connection) => {
        connection.on('message', (message) => {
            const { id, method } = JSON.parse(message);
            const result = { eth_chainId: '0x1', eth_blockNumber: '0x2a' }[method];
            connection.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
        });
    });
    const provider = new WebSocketProvider('ws://127.0.0.1:' + server.address().port, 1);
    try {
        assert.equal(await provider.getBlockNumber(), 42);
    } finally {
        await provider.destroy();
        await new Promise((resolve) => server.close(resolve));
    }
});
