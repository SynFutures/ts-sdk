const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { BigNumber, constants } = require('ethers');
const { SynFuturesStakingVault__factory, SynFuturesToken__factory } = require('../build/typechain');
const { toPopulatedTxOverrides, wdiv, wmul } = require('../build/utils');

test('staking and token bindings match the deployed plugin ABIs', () => {
    // SHA-256 of each original factory ABI, serialized by JSON.stringify.
    for (const [factory, hash] of [
        [SynFuturesStakingVault__factory, 'c9629e6360021fe6c49ad36deb90b49fde3ef114cf0a9439f0224c068f13d154'],
        [SynFuturesToken__factory, '86ce1b5242c294a6293b4f458d1b467472044359656bb2a2aaa0ff0d8339cf3b'],
    ]) {
        assert.equal(createHash('sha256').update(JSON.stringify(factory.abi)).digest('hex'), hash);
    }
    const vault = SynFuturesStakingVault__factory.createInterface();
    assert.equal(vault.deploy.inputs.length, 0);
    assert.equal(vault.getFunction('initialize(address,address)').inputs.length, 2);
    for (const name of ['ZeroAddress', 'ZeroAmount', 'RenounceOwnershipDisabled']) assert.ok(vault.getError(name));
});

test('population preserves explicit senders and leaves the original transaction options intact', async () => {
    const address = '0x0000000000000000000000000000000000000001';
    const signer = { getAddress: async () => address };
    const options = Object.freeze({
        signer,
        gasLimit: 120,
        nonce: 0,
        blockTag: 'latest',
        enableGasPrice: true,
        disableGasLimit: true,
        gasLimitMultiple: 1.7,
        gasPriceMultiple: 1.2,
    });
    const overrides = toPopulatedTxOverrides(options);
    assert.deepEqual({ ...overrides, from: await overrides.from }, { from: address, gasLimit: 120, nonce: 0 });
    const from = '0x0000000000000000000000000000000000000002';
    assert.deepEqual(toPopulatedTxOverrides({ ...options, from }), { from, gasLimit: 120, nonce: 0 });
    assert.deepEqual(toPopulatedTxOverrides(), {});
});

test('staking can populate a transaction with disabled gas options and zero-valued overrides', async () => {
    const address = '0x0000000000000000000000000000000000000001';
    const options = Object.freeze({
        blockTag: 0,
        enableGasPrice: false,
        disableGasLimit: false,
        gasLimitMultiple: 0,
        gasPriceMultiple: 0,
        nonce: 0,
        gasPrice: 0,
    });
    const overrides = toPopulatedTxOverrides(options);
    assert.deepEqual(overrides, { nonce: 0, gasPrice: 0 });
    const vault = SynFuturesStakingVault__factory.connect(address);
    const tx = await vault.populateTransaction.stake(1, overrides);
    assert.equal(tx.nonce, 0);
    assert.ok(tx.gasPrice.isZero());
    assert.equal(tx.data, vault.interface.encodeFunctionData('stake', [1]));
});

test('fixed-point helpers match integer rounding at a half unit and for negative inputs', () => {
    const half = constants.WeiPerEther.div(2);
    assert.equal(wmul(half, BigNumber.from(1)).toString(), '1');
    assert.equal(wmul(half.sub(1), BigNumber.from(1)).toString(), '0');
    assert.equal(wmul(half.mul(-3), BigNumber.from(1)).toString(), '-1');
    assert.equal(wdiv(BigNumber.from(-3), constants.WeiPerEther.mul(2)).toString(), '-1');
    assert.throws(() => wdiv(constants.One, constants.Zero));
});
