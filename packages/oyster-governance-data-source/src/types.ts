import { BigNumber } from 'ethers';

export type QueryHistoryParam = QueryEventParam;

export interface Pagination {
    page?: number;
    size?: number;
}

export interface QueryEventParam extends Pagination {
    eventNames?: string[];
    accounts?: string[];
    startTs?: number;
    endTs?: number;
}

export interface TransactionEvent {
    id: string;
    txHash: string;
    account: string;
    blockNumber: number;
    timestamp: number;
    logIndex: number;
    name: string;
    args: { [key: string]: any };
}

export interface PendingUnstakeWithTx {
    pendingIndex: number;
    txHash: string;
    amount: BigNumber;
}
