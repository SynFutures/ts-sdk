import type { AirdropHost, TxOptions, TxOptionsWithSigner } from './host';
import { CallOverrides, ethers } from 'ethers';

export interface AirdropInterface<Host extends AirdropHost = AirdropHost> {
    readonly synfV3: Host;
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
