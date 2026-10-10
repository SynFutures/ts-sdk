import { encodeFunctionData, zeroAddress } from 'viem';
import type { TypedWriteRequest } from '@derivation-tech/viem-kit';
import { encodeDepositParam } from '@synfutures/perpv3-ts/utils';
import { PairSnapshot, PerpClient, UserSetting, ValidationError } from '@synfutures/perpv3-ts';
import {
    PairSnapshot as TypesPairSnapshot,
    UserSetting as TypesUserSetting,
    ValidationError as TypesValidationError,
} from '@synfutures/perpv3-ts/types';
import { LoggerFactory, TransactionRevertedError } from '@derivation-tech/viem-kit';
import {
    LoggerFactory as UtilsLoggerFactory,
    TransactionRevertedError as UtilsTransactionRevertedError,
} from '@derivation-tech/viem-kit/utils';
import { CURRENT_GATE_ABI } from '@synfutures/perpv3-ts/abis';
import { createGateParser } from '@synfutures/perpv3-ts/parsers';
import { contractCallEncoder } from '@synfutures/perpv3-ts/frontend';

const payload = encodeDepositParam(zeroAddress, 1n);
const request = {
    address: zeroAddress,
    abi: CURRENT_GATE_ABI,
    functionName: 'deposit',
    args: [payload],
} satisfies TypedWriteRequest<typeof CURRENT_GATE_ABI, 'deposit'>;
const encoded = contractCallEncoder.encodeDeposit({ tokenAddress: zeroAddress, amount: 1n }, zeroAddress).data;
if (encoded !== encodeFunctionData(request)) {
    throw new Error('Encoder calldata differs from the contract ABI');
}
if (typeof PerpClient !== 'function' || !createGateParser().parseTransaction) {
    throw new Error('Public client or typed parser missing');
}
export function rejectedWriteRequests() {
    void ({
        address: zeroAddress,
        abi: CURRENT_GATE_ABI,
        functionName: 'deposit',
        // @ts-expect-error deposit requires one bytes argument.
        args: [],
    } satisfies TypedWriteRequest<typeof CURRENT_GATE_ABI, 'deposit'>);
    void ({
        address: zeroAddress,
        abi: CURRENT_GATE_ABI,
        // @ts-expect-error read-only functions cannot form write requests.
        functionName: 'balanceOf',
        args: [zeroAddress],
    } satisfies TypedWriteRequest<typeof CURRENT_GATE_ABI, 'deposit'>);
}

// Consumers mix root and subpath imports. Bundling must preserve class and state identity.
if (
    PairSnapshot !== TypesPairSnapshot ||
    UserSetting !== TypesUserSetting ||
    ValidationError !== TypesValidationError
) {
    throw new Error('PerpV3 root and subpath constructors differ');
}
let rejectedInvalidLeverage = false;
try {
    new TypesUserSetting(60, 100, 0n);
} catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    rejectedInvalidLeverage = true;
}
if (!rejectedInvalidLeverage) throw new Error('Invalid leverage did not throw the public ValidationError');
if (TransactionRevertedError !== UtilsTransactionRevertedError) {
    throw new Error('viem-kit root and utils errors differ');
}
const logger = LoggerFactory.getLogger('perpv3-packed-consumer');
UtilsLoggerFactory.setLogger('perpv3-packed-consumer-injected', logger);
if (LoggerFactory.getLogger('perpv3-packed-consumer-injected') !== logger) {
    throw new Error('viem-kit logger state differs between entries');
}
LoggerFactory.clear();
