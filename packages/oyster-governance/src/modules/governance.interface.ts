import { BigNumber, ethers, CallOverrides } from 'ethers';
import { BaseInterface, TxOptions, TxOptionsWithSigner } from '@synfutures/oyster-sdk2';
import { SynFuturesStakingVault, SynFuturesToken } from '@synfutures/oyster-governance-abi';
import { PendingUnstake, BoostSettings, VotingPowerSettings } from '../types';
import { ActionType } from '../enum';

export interface GovernanceInterface extends BaseInterface {
    stakingVault: SynFuturesStakingVault;

    token: SynFuturesToken;

    stake(amount: BigNumber, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    stake(amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    stake(
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;

    unstake(amount: BigNumber, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    unstake(amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    unstake(
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;

    release(index: number, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    release(index: number, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    release(
        index: number,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;

    getStakingInfo(
        accAddress: string,
        overrides?: CallOverrides
    ): Promise<{ stakes: BigNumber; pendingUnstakes: PendingUnstake[] }>;

    simulateNextDayBoost(
        currentBoost: BigNumber,
        lastUnstakeTime: number,
        currentStakeAmount: BigNumber,
        tvlInTokenWad: BigNumber,
        action: ActionType,
        actionAmount: BigNumber,
        settings: BoostSettings
    ): BigNumber;

    simulateNextDayVotingPower(
        currentVotingPower: BigNumber,
        lastUnstakeTime: number,
        currentStakeAmount: BigNumber,
        action: ActionType,
        actionAmount: BigNumber,
        settings: VotingPowerSettings
    ): BigNumber;
}
