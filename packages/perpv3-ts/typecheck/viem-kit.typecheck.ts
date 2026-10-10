import { zeroAddress } from 'viem';
import type { TypedWriteRequest } from '@derivation-tech/viem-kit';
import { CURRENT_GATE_ABI } from '../src/abis';

const typedDeposit = {
    address: zeroAddress,
    abi: CURRENT_GATE_ABI,
    functionName: 'deposit',
    args: ['0x'],
} satisfies TypedWriteRequest<typeof CURRENT_GATE_ABI, 'deposit'>;

const invalidDeposit = {
    address: zeroAddress,
    abi: CURRENT_GATE_ABI,
    functionName: 'deposit',
    // @ts-expect-error deposit receives one packed bytes argument.
    args: [],
} satisfies TypedWriteRequest<typeof CURRENT_GATE_ABI, 'deposit'>;

void typedDeposit;
void invalidDeposit;
