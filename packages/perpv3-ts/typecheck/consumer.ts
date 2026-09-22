import { encodeFunctionData, zeroAddress } from 'viem';
import type { TypedWriteRequest } from '@derivation-tech/viem-kit';
import { encodeDepositParam } from '@synfutures/perpv3-ts/utils';
import { PerpClient } from '@synfutures/perpv3-ts';
import { CURRENT_GATE_ABI } from '@synfutures/perpv3-ts/abis';
import { createGateParser } from '@synfutures/perpv3-ts/parsers';
import { createGateWriteRequest, encodeGateWriteRequest } from '@synfutures/perpv3-ts/frontend';

const payload = encodeDepositParam(zeroAddress, 1n);
const request = createGateWriteRequest(zeroAddress, 'deposit', [payload]);
const typed: TypedWriteRequest<typeof CURRENT_GATE_ABI, 'deposit'> = request;
const encoded = encodeGateWriteRequest(typed);
if (encoded !== encodeFunctionData({ abi: CURRENT_GATE_ABI, functionName: 'deposit', args: [payload] })) {
    throw new Error('Typed request calldata differs from the contract ABI');
}
if (typeof PerpClient !== 'function' || !createGateParser().parseTransaction) {
    throw new Error('Public client or typed parser missing');
}
export function rejectedWriteRequests() {
    // @ts-expect-error deposit requires one bytes argument.
    createGateWriteRequest(zeroAddress, 'deposit', []);
    // @ts-expect-error read-only functions cannot form write requests.
    createGateWriteRequest(zeroAddress, 'balanceOf', [zeroAddress]);
}
