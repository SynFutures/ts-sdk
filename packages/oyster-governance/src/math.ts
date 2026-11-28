export type StakeAction = 'stake' | 'unstake' | 'hold';
export interface StakeChange {
    stake: bigint;
    action: StakeAction;
    amount: bigint;
    lastUnstakeTime: number;
    now?: number;
}
export interface BoostSettings {
    minThreshold: bigint;
    baselineBoost: bigint;
    dailyBoostCap: bigint;
    baselineAmount: bigint;
    targetDays: bigint;
}
export interface VotingPowerSettings {
    minThreshold: bigint;
    baselineAmount: bigint;
    maxPowerBoost: bigint;
}
const wad = 10n ** 18n;
export function wmul(x: bigint, y: bigint) {
    return (x * y + wad / 2n) / wad;
}
export function wdiv(x: bigint, y: bigint) {
    return (x * wad + y / 2n) / y;
}
function min(a: bigint, b: bigint) {
    return a < b ? a : b;
}
function nextStake(change: StakeChange) {
    if (change.amount < 0n || change.stake < 0n) throw new RangeError('Stake and amount must be nonnegative');
    if (change.action === 'unstake' && change.amount > change.stake) throw new RangeError('Unstake exceeds stake');
    if (change.action === 'stake') return change.stake + change.amount;
    return change.action === 'unstake' ? change.stake - change.amount : change.stake;
}
function reset(change: StakeChange) {
    return (
        change.action === 'unstake' ||
        (change.lastUnstakeTime !== 0 &&
            Math.floor(change.lastUnstakeTime / 86400) === Math.floor((change.now ?? Date.now() / 1000) / 86400))
    );
}
export function simulateNextDayBoost(change: StakeChange, currentBoost: bigint, tvl: bigint, settings: BoostSettings) {
    const stake = nextStake(change);
    const denominator = settings.baselineAmount > tvl ? settings.baselineAmount : tvl;
    const daily = min(settings.dailyBoostCap, wdiv(stake, denominator) / settings.targetDays);
    const baseline = stake >= settings.minThreshold ? settings.baselineBoost : 0n;
    return (
        (reset(change) || change.stake === 0n || stake === 0n || currentBoost === 0n ? baseline : currentBoost) + daily
    );
}
export function simulateNextDayVotingPower(change: StakeChange, currentPower: bigint, settings: VotingPowerSettings) {
    const stake = nextStake(change);
    const daily =
        stake === 0n || stake < settings.minThreshold
            ? 0n
            : wmul(wmul(settings.baselineAmount, wdiv(wad, settings.minThreshold) - wdiv(wad, stake)), stake);
    if (reset(change)) return daily;
    return min(
        stake * settings.maxPowerBoost,
        (change.stake === 0n ? 0n : wmul(currentPower, wdiv(stake, change.stake))) + daily
    );
}
