import type { LegacyPluginHost } from '../../legacy-plugin-host';
import { BigNumber } from '@ethersproject/bignumber';
import { orderBy as _orderBy } from 'lodash';
import { Graph, GRAPH_PAGE_SIZE } from '../../legacy-host-types/core';
import { GovernanceDataSourceInterface } from './governanceDataSource.inteface';
import { QueryEventParam, PendingUnstakeWithTx, TransactionEvent, QueryHistoryParam } from '../types';

export class GovernanceDataSourceModule<Host extends object = LegacyPluginHost>
    extends Graph
    implements GovernanceDataSourceInterface<Host>
{
    synfV3: Host;

    constructor(synfV3: Host, endpoint: string) {
        super(endpoint);
        this.synfV3 = synfV3;
    }

    buildQueryEventCondition(param: QueryEventParam): string {
        const fn = (str: string): string => `"${str}"`;

        let accountCondition = '';
        let eventCondition = '';

        if (param.eventNames && param.eventNames.length > 0) {
            eventCondition = `name_in: [${param.eventNames.map((e) => fn(e)).join(',')}],`;
        }

        if (param.accounts && param.accounts.length > 0) {
            accountCondition = `account_in: [${param.accounts.map((t) => fn(t.toLowerCase())).join(',')}],`;
        }

        const startTsCondition = `timestamp_gte: ${param.startTs || 0},`;
        const endTsCondition = `timestamp_lt: ${param.endTs || Math.floor(Date.now() / 1000)},`;

        const condition = `${eventCondition}${accountCondition}${startTsCondition}${endTsCondition}`;
        return `where: {${condition} id_gt: $lastID}, `;
    }

    buildQueryCurrentPendingUnstakeCondition(account: string): string {
        const fn = (str: string): string => `"${str}"`;
        const accountCondition = `staker_:{id:${fn(account.toLowerCase())}},`;
        const statusCondition = `status:PENDING,`;
        const condition = `${statusCondition}${accountCondition}`;
        return `where: {${condition} id_gt: $lastID}, `;
    }

    async getLastUnstakeTime(account: string): Promise<number> {
        const param: QueryEventParam = {
            accounts: [account],
            eventNames: ['Unstake'],
            size: 1,
            page: 0,
        };
        const events = await this.getHistoryEvents(param);
        return events.length > 0 ? events[0].timestamp : 0;
    }

    async getCurrentPendingUnstakes(account: string): Promise<PendingUnstakeWithTx[]> {
        const condition = this.buildQueryCurrentPendingUnstakeCondition(account);
        const graphQL = `query($skip: Int, $first: Int, $lastID: String){
            pendingUnstakes(skip: $skip, first: $first, ${condition}){
                id
                pendingIndex
                amount
                transaction {
                    id
                }
            }
        }`;
        const pendingUnstakes = await this.queryAll(graphQL, GRAPH_PAGE_SIZE, true);
        const result: PendingUnstakeWithTx[] = [];
        for (const pendingUnstake of pendingUnstakes) {
            result.push({
                pendingIndex: parseInt(pendingUnstake.pendingIndex),
                txHash: pendingUnstake.transaction.id,
                amount: BigNumber.from(pendingUnstake.amount),
            });
        }
        return result;
    }

    // query general-purposed transaction events
    async getHistoryEvents(param: QueryHistoryParam): Promise<TransactionEvent[]> {
        const queryAll = param.size === undefined && param.page === undefined;
        const first = param.size || 1000;
        const skip = (param.page || 0) * first;
        if (param.eventNames === undefined || param.eventNames.length === 0) {
            param.eventNames = ['Stake', 'Unstake', 'Release'];
        }
        let condition = this.buildQueryEventCondition(param);
        condition = queryAll ? condition : condition + 'orderBy: timestamp, orderDirection: desc';

        const graphQL = `query($skip: Int, $first: Int, $lastID: String){
            transactionEvents(skip: $skip, first: $first, ${condition}){
                id
                name
                args
                account
                logIndex
                blockNumber
                timestamp
                transaction {
                    id
                }
            }
        }`;
        let transactionEvents;
        if (queryAll) {
            transactionEvents = await this.queryAll(graphQL, GRAPH_PAGE_SIZE, true);
        } else {
            const resp = await this.query(graphQL, skip, first);
            transactionEvents = resp.transactionEvents;
        }
        let result: TransactionEvent[] = [];
        for (const txEvent of transactionEvents) {
            result.push({
                id: txEvent.id,
                txHash: txEvent.transaction.id,
                account: txEvent.account,
                blockNumber: Number(txEvent.blockNumber),
                timestamp: Number(txEvent.timestamp),
                logIndex: Number(txEvent.logIndex),
                name: txEvent.name,
                args: JSON.parse(txEvent.args),
            });
        }
        // newest first
        result = _orderBy(result, ['blockNumber', 'logIndex'], ['desc', 'desc']);
        return result;
    }
}
