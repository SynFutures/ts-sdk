import type { Address, Hash } from 'viem';
import type { HistoryQuery, PendingUnstakeWithTx, TransactionEvent } from './types';
export type { HistoryQuery, PendingUnstakeWithTx, TransactionEvent } from './types';

const pageSize = 1000;
const eventsQuery = `query History($where: TransactionEvent_filter!, $first: Int!, $skip: Int!, $order: TransactionEvent_orderBy!, $direction: OrderDirection!) {
    transactionEvents(where: $where, first: $first, skip: $skip, orderBy: $order, orderDirection: $direction) {
        id name account args blockNumber timestamp logIndex transaction { id }
    }
}`;
const pendingQuery = `query Pending($where: PendingUnstake_filter!, $first: Int!) {
    pendingUnstakes(where: $where, first: $first, orderBy: id, orderDirection: asc) { id pendingIndex amount transaction { id } }
}`;

type Row = Record<string, unknown>;
function record(value: unknown): Row {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a subgraph object');
    return value as Row;
}
function string(value: unknown): string {
    if (typeof value !== 'string') throw new Error('Expected a subgraph string');
    return value;
}
function uint(value: unknown): bigint {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Expected a nonnegative integer');
    return BigInt(value);
}
function number(value: unknown): number {
    const result = Number(uint(value));
    if (!Number.isSafeInteger(result)) throw new RangeError('Integer exceeds safe range');
    return result;
}
function hash(value: unknown): Hash {
    if (typeof value !== 'string' || !/^0x[\da-f]{64}$/i.test(value)) throw new Error('Invalid transaction hash');
    return value as Hash;
}
function event(row: Row): TransactionEvent {
    const account = string(row.account);
    if (!/^0x[\da-f]{40}$/i.test(account)) throw new Error('Invalid event account');
    return {
        id: string(row.id),
        txHash: hash(record(row.transaction).id),
        account: account as Address,
        blockNumber: uint(row.blockNumber),
        timestamp: number(row.timestamp),
        logIndex: number(row.logIndex),
        name: string(row.name),
        args: record(JSON.parse(string(row.args))),
    };
}

export class GovernanceDataSource {
    constructor(
        readonly endpoint: string,
        private readonly fetcher: typeof fetch = fetch
    ) {}

    private async query(query: string, variables: Row, field: string): Promise<Row[]> {
        const response = await this.fetcher(this.endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query, variables }),
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Subgraph HTTP ${response.status}`);
        const result = record(await response.json());
        if (result.errors) throw new Error(`Subgraph query failed: ${JSON.stringify(result.errors)}`);
        const rows = record(result.data)[field];
        if (!Array.isArray(rows)) throw new Error(`Missing subgraph rows: ${field}`);
        return rows.map(record);
    }

    private async all(fetchPage: (cursor: string) => Promise<Row[]>): Promise<Row[]> {
        const result: Row[] = [];
        let cursor = '';
        for (;;) {
            const rows = await fetchPage(cursor);
            result.push(...rows);
            if (rows.length < pageSize) return result;
            const next = string(rows[rows.length - 1].id);
            if (next <= cursor) throw new Error('Subgraph cursor did not advance');
            cursor = next;
        }
    }

    async getHistoryEvents(options: HistoryQuery = {}): Promise<TransactionEvent[]> {
        const where = {
            name_in: options.eventNames?.length ? options.eventNames : ['Stake', 'Unstake', 'Release'],
            account_in: options.accounts?.length ? options.accounts.map((a) => a.toLowerCase()) : undefined,
            timestamp_gte: String(number(options.startTs ?? 0)),
            timestamp_lt: String(number(options.endTs ?? Math.floor(Date.now() / 1000))),
        };
        let rows: Row[];
        if (options.page !== undefined || options.size !== undefined) {
            const first = number(options.size ?? pageSize);
            const skip = number(number(options.page ?? 0) * first);
            rows = await this.query(
                eventsQuery,
                { where, first, skip, order: 'timestamp', direction: 'desc' },
                'transactionEvents'
            );
        } else {
            rows = await this.all((cursor) =>
                this.query(
                    eventsQuery,
                    {
                        where: { ...where, id_gt: cursor },
                        first: pageSize,
                        skip: 0,
                        order: 'id',
                        direction: 'asc',
                    },
                    'transactionEvents'
                )
            );
        }
        return rows
            .map(event)
            .sort((a, b) =>
                a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1
            );
    }

    async getLastUnstakeTime(account: Address): Promise<number> {
        const [last] = await this.getHistoryEvents({ accounts: [account], eventNames: ['Unstake'], size: 1 });
        return last?.timestamp ?? 0;
    }

    async getCurrentPendingUnstakes(account: Address): Promise<PendingUnstakeWithTx[]> {
        const rows = await this.all((cursor) =>
            this.query(
                pendingQuery,
                {
                    where: { status: 'PENDING', staker_: { id: account.toLowerCase() }, id_gt: cursor },
                    first: pageSize,
                },
                'pendingUnstakes'
            )
        );
        return rows.map((row) => ({
            pendingIndex: uint(row.pendingIndex),
            amount: uint(row.amount),
            txHash: hash(record(row.transaction).id),
        }));
    }
}
