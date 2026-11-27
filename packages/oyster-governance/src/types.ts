import { BigNumber } from 'ethers';

export interface PendingUnstake {
    index: number;
    amount: BigNumber;
    createTime: number;
    releaseTime?: number;
}

export interface BoostSettings {
    maxBoost: BigNumber; // default parseEther('1') = 100%
    baselineBoost: BigNumber; // // default parseEther('0.1') = 10%
    dailyBoostCap: BigNumber; // default parseEther('0.1') = 10%
    targetDays: number; // default 30

    minThreshold: BigNumber; // default parseEther('10000')
    baselineAmount: BigNumber; // default parseEther('1000000')
}

export interface VotingPowerSettings {
    minThreshold: BigNumber; // default 100,000, 10% of baseline amount
    baselineAmount: BigNumber; // 1,000,000, 0.1bp of total supply
    maxPowerBoost: number; // 3600
}
