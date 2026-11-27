const assert = require('node:assert/strict');
const test = require('node:test');
const { ethers } = require('ethers');
const { governancePlugin } = require('../build');
const { STAKE_ADDRESSES, S_TOKENINFO } = require('../build/constants');
const { SynFuturesStakingVaultParser } = require('../build/parser');

test('governance follows provider changes and preserves the host transaction workflow', async () => {
    const ctx = {
        chainId: 1, provider: new ethers.providers.JsonRpcProvider(), tokenInfo: new Map(),
        addresses: new Map(), parsers: new Map(),
        registerAddress(address, name) { this.addresses.set(address, name); },
        registerContractParser(address, parser) { this.parsers.set(address, parser); },
    };
    const receipt = { status: 1 };
    const options = { signer: ethers.Wallet.createRandom() };
    const host = {
        ctx, addSetProviderHook(hook) { this.hook = hook; },
    };
    const { governance } = governancePlugin().install(host);
    assert.equal(ctx.addresses.get(STAKE_ADDRESSES[1]), 'SynFuturesStakingVault');
    assert.ok(ctx.parsers.get(STAKE_ADDRESSES[1]) instanceof SynFuturesStakingVaultParser);
    assert.equal(ctx.tokenInfo.get('s'), S_TOKENINFO[1]);
    const abi = governance.stakingVault.interface;
    ctx.multicall3 = { callStatic: { aggregate: async () => ({ returnData: [
        abi.encodeFunctionResult('pendingDuration', [60]),
        abi.encodeFunctionResult('accountStakeInfo', [12, []]),
    ] }) } };
    const info = await governance.getStakingInfo(options.signer.address);
    assert.equal(info.stakes.toString(), '12');
    assert.deepEqual(info.pendingUnstakes, []);
    for (const method of ['stake', 'unstake', 'release']) {
        await assert.rejects(governance[method](0), {
            name: 'Error',
            message: /install the transaction plugin.*host\.tx/i,
        });
    }
    host.tx = { sendTx: async (tx, opts) => {
        if (opts === undefined) return tx;
        assert.equal(opts, options);
        return receipt;
    } };
    for (const [method, arg] of [['stake', 12], ['unstake', 4], ['release', 0]]) {
        const tx = await governance[method](arg);
        assert.equal(tx.to, STAKE_ADDRESSES[1]);
        assert.equal(tx.data, governance.stakingVault.interface.encodeFunctionData(method, [arg]));
        assert.equal(await governance[method](arg, options), receipt);
    }
    ctx.chainId = 8453;
    ctx.provider = new ethers.providers.JsonRpcProvider();
    host.hook();
    assert.equal(governance.token.provider, ctx.provider);
    assert.equal(governance.token.address, S_TOKENINFO[8453].address);
    assert.equal(governance.stakingVault.address, ethers.constants.AddressZero);
    assert.equal(ctx.tokenInfo.get(governance.token.address.toLowerCase()), S_TOKENINFO[8453]);
});
