import type { BigNumber, ethers } from 'ethers';
import type { BaseInterface } from '../types';
import type { TxOptions, TxOptionsWithSigner } from '../types';
export interface GateInterface extends BaseInterface {
    /**
     * Deposit to Gate
     * @param quoteAddr the quote address
     * @param amount the amount(according to the decimals of the quote address,eg: 1USDC = 1000000)
     * @param txOptions overrides with ethers types
     */
    deposit(
        quoteAddr: string,
        amount: BigNumber,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    deposit(quoteAddr: string, amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    deposit(
        quoteAddr: string,
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Deposit to Gate, decimal will be converted
     * @param quoteAddr the quote address
     * @param amount the amount(according to the decimals of the quote address,eg: 1USDC = 1000000)
     * @param txOptions overrides with ethers types
     */
    depositWad(
        quoteAddr: string,
        amount: BigNumber,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    depositWad(quoteAddr: string, amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    depositWad(
        quoteAddr: string,
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Withdraw from Gate
     * @param quoteAddr the quote address
     * @param amount the amount(according to the decimals of the quote address,eg: 1USDC = 1000000)
     * @param txOptions overrides with ethers types
     */
    withdraw(
        quoteAddr: string,
        amount: BigNumber,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    withdraw(quoteAddr: string, amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    withdraw(
        quoteAddr: string,
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Withdraw from Gate, decimal will be converted
     * @param quoteAddr the quote address
     * @param amount the amount(according to the decimals of the quote address,eg: 1USDC = 1000000)
     * @param txOptions overrides with ethers types
     */
    withdrawWad(
        quoteAddr: string,
        amount: BigNumber,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    withdrawWad(quoteAddr: string, amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    withdrawWad(
        quoteAddr: string,
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Get pending params
     * @param quotes the quotes address list
     * @param txOptions overrides with ethers types
     */
    getPendingParams(
        quotes: string[],
        txOptions?: TxOptions
    ): Promise<{
        pendingDuration: BigNumber;
        thresholds: BigNumber[];
    }>;
    /**
     * Claim pending withdraw
     * @param quote the quote address
     * @param trader the trader address
     * @param txOptions overrides with ethers types
     */
    claimPendingWithdraw(
        quote: string,
        trader: string,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    claimPendingWithdraw(quote: string, trader: string, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    claimPendingWithdraw(
        quote: string,
        trader: string,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
}
