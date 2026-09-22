import { zeroAddress } from 'viem';
import type { TypedWriteRequest } from '@derivation-tech/viem-kit';
import { CURRENT_GATE_ABI } from '../src/abis';
import { createGateWriteRequest } from '../src/frontend/calldata';

const deposit = createGateWriteRequest(zeroAddress, 'deposit', ['0x']);
const typedDeposit: TypedWriteRequest<typeof CURRENT_GATE_ABI, 'deposit'> = deposit;

const invalidDeposit = {
    address: zeroAddress,
    abi: CURRENT_GATE_ABI,
    functionName: 'deposit',
    // @ts-expect-error deposit receives one packed bytes argument.
    args: [],
} satisfies TypedWriteRequest<typeof CURRENT_GATE_ABI, 'deposit'>;

void typedDeposit;
void invalidDeposit;
