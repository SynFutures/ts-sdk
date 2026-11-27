import type * as ethers from 'ethers';
import type { BaseInterface, TxOptions } from '../types';
export interface TxInterface extends BaseInterface {
    /**
     * Send transaction
     * @param rawTx the raw transaction(unsigned transaction)
     * @param txOptions the transaction options
     */
    sendTx(
        rawTx: ethers.PopulatedTransaction,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
}
