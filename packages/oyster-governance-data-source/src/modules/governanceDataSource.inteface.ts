import { PendingUnstakeWithTx, TransactionEvent, QueryHistoryParam } from '../types';

export interface GovernanceDataSourceInterface<Host extends object = object> {
    readonly synfV3: Host;
    getLastUnstakeTime(account: string): Promise<number>;

    getCurrentPendingUnstakes(account: string): Promise<PendingUnstakeWithTx[]>;

    getHistoryEvents(param: QueryHistoryParam): Promise<TransactionEvent[]>;
}
