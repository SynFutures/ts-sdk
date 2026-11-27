import { BaseInterface, TxOptions, TxOptionsWithSigner } from '@synfutures/oyster-sdk2';
import { CallOverrides, ethers } from 'ethers';

export interface AirdropInterface extends BaseInterface {
    claim(
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    claim(
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions?: TxOptions
    ): Promise<ethers.PopulatedTransaction>;
    claim(
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;

    claim(
        contractAddress: string,
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    claim(
        contractAddress: string,
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions?: TxOptions
    ): Promise<ethers.PopulatedTransaction>;
    claim(
        contractAddress: string,
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;

    isClaimed(contractAddress: string, index: number, overrides?: CallOverrides): Promise<boolean>;
    isClaimed(index: number, overrides?: CallOverrides): Promise<boolean>;
}
