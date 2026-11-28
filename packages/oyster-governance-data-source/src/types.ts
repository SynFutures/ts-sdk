import type { Address, Hash } from 'viem';

export interface HistoryQuery {
    accounts?: readonly Address[];
    eventNames?: readonly string[];
    startTs?: number;
    endTs?: number;
    page?: number;
    size?: number;
}

export interface TransactionEvent {
    id: string;
    txHash: Hash;
    account: Address;
    blockNumber: bigint;
    timestamp: number;
    logIndex: number;
    name: string;
    args: Record<string, unknown>;
}

export interface PendingUnstakeWithTx {
    pendingIndex: bigint;
    txHash: Hash;
    amount: bigint;
}
