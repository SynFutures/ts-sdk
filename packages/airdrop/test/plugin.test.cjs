const assert = require('node:assert/strict');
const test = require('node:test');
const { ethers } = require('ethers');
const { airdropPlugin, AirdropContracts, Airdrop__factory, MerkleDistributorWithDeadlineAbi } = require('../build');
const { AirdropParser } = require('../build/parser');

test('the raw ABI preserves its published CommonJS namespace and factory signatures', () => {
    const raw = require('../build/abis/airdrop.json');
    assert.deepEqual(Object.keys(MerkleDistributorWithDeadlineAbi), [...Object.keys(raw), 'default']);
    assert.deepEqual(MerkleDistributorWithDeadlineAbi.default, raw);
    for (const i of Object.keys(raw)) assert.equal(MerkleDistributorWithDeadlineAbi[i], raw[i]);
    const abi = Airdrop__factory.createInterface();
    assert.equal(abi.getSighash('withdraw'), new ethers.utils.Interface(raw).getSighash('withdraw'));
});

test('chain-selected and explicit distributors preserve reads, calldata and signer routing', async () => {
    const account = '0x0000000000000000000000000000000000000001';
    const custom = '0x0000000000000000000000000000000000000002';
    const abi = Airdrop__factory.createInterface();
    const calls = [];
    const registered = [];
    const receipt = { status: 1 };
    const options = { signer: ethers.Wallet.createRandom() };
    const provider = new ethers.providers.Web3Provider({ request: async ({ method, params }) => {
        if (method === 'eth_chainId') return '0x1';
        assert.equal(method, 'eth_call');
        calls.push(params);
        return abi.encodeFunctionResult('isClaimed', [true]);
    } }, 1);
    const host = {
        ctx: {
            chainId: 1, provider,
            registerAddress: (address, name) => registered.push([address, name]),
            registerContractParser: (address, parser) => {
                assert.equal(address, AirdropContracts[1]);
                assert.ok(parser instanceof AirdropParser);
            },
        },
    };
    const { airdrop } = airdropPlugin().install(host);
    assert.equal(await airdrop.isClaimed(custom, 0), true);
    await assert.rejects(airdrop.claim(custom, 0, '123', account, []), {
        name: 'Error',
        message: /install the transaction plugin.*host\.tx/i,
    });
    host.tx = { sendTx: async (tx, opts) => {
        if (opts === undefined) return tx;
        assert.equal(opts, options);
        return receipt;
    } };
    for (const [address, prefix] of [[AirdropContracts[1], []], [custom, [custom]]]) {
        assert.equal(await airdrop.isClaimed(...prefix, 0, { blockTag: 21 }), true);
        assert.deepEqual(calls.at(-1), [{
            to: address.toLowerCase(),
            data: abi.encodeFunctionData('isClaimed', [0]),
        }, '0x15']);
        const tx = await airdrop.claim(...prefix, 0, '123', account, []);
        assert.equal(tx.to, address);
        assert.equal(tx.data, abi.encodeFunctionData('claim', [0, account, 123, []]));
        assert.equal(await airdrop.claim(...prefix, 0, '123', account, [], options), receipt);
    }
    assert.deepEqual(registered, Array(3).fill([AirdropContracts[1], 'Airdrop']));
});
