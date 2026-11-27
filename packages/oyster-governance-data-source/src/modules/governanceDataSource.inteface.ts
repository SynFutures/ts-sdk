import { BaseInterface } from '@synfutures/oyster-sdk2';
import { PendingUnstakeWithTx, TransactionEvent, QueryHistoryParam } from '../types';

export interface GovernanceDataSourceInterface extends BaseInterface {
    getLastUnstakeTime(account: string): Promise<number>;

    getCurrentPendingUnstakes(account: string): Promise<PendingUnstakeWithTx[]>;

    getHistoryEvents(param: QueryHistoryParam): Promise<TransactionEvent[]>;
}
