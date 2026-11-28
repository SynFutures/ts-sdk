const assert = require('node:assert/strict'),
    test = require('node:test');
const { createHash } = require('node:crypto');
const {
    oysterVaultAbi,
    governanceTokenAbi,
    wmul,
    wdiv,
    simulateNextDayVotingPower,
    simulateNextDayBoost,
} = require('../dist/index.cjs');
test('preserves the Oyster vault and token ABIs', () => {
    for (const [abi, hash] of [
        [oysterVaultAbi, 'c9629e6360021fe6c49ad36deb90b49fde3ef114cf0a9439f0224c068f13d154'],
        [governanceTokenAbi, '86ce1b5242c294a6293b4f458d1b467472044359656bb2a2aaa0ff0d8339cf3b'],
    ])
        assert.equal(createHash('sha256').update(JSON.stringify(abi)).digest('hex'), hash);
});
test('WAD math retains half-unit rounding, caps, unstake reset and UTC rollover', () => {
    const w = 10n ** 18n;
    assert.equal(wmul(w / 2n, 1n), 1n);
    assert.equal(wmul(w / 2n - 1n, 1n), 0n);
    assert.equal(wdiv(-3n, 2n * w), -1n);
    const change = { stake: 2n * w, action: 'hold', amount: 0n, lastUnstakeTime: 86399, now: 86400 };
    const settings = { minThreshold: w, baselineAmount: 2n * w, maxPowerBoost: 3n };
    assert.equal(simulateNextDayVotingPower(change, 2n * w, settings), 4n * w);
    assert.equal(simulateNextDayVotingPower({ ...change, now: 86399 }, 2n * w, settings), 2n * w);
    assert.equal(simulateNextDayVotingPower(change, 100n * w, settings), 6n * w);
    assert.equal(simulateNextDayVotingPower({ ...change, action: 'unstake', amount: 2n * w }, w, settings), 0n);
    const boost = { ...settings, baselineBoost: w, dailyBoostCap: w / 4n, targetDays: 2n };
    assert.equal(simulateNextDayBoost(change, 2n * w, w, boost), 2n * w + w / 4n);
    assert.equal(simulateNextDayBoost({ ...change, now: 86399 }, 2n * w, w, boost), w + w / 4n);
});
