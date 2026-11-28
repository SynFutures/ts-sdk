import { expect } from '@jest/globals';

export function compareTradeResults(apiResult: unknown, rpcResult: unknown): void {
    expect(apiResult).toStrictEqual(rpcResult);
}
