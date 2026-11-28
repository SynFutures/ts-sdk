import { encodeFunctionData, parseSignature } from 'viem';
import { ERC20_WITH_PERMIT_ABI } from '../../abis';
import type { ApproveEncodingParam, SignedPermit, TransactionParam } from './types';

export function encodeApproveTransaction({
    tokenAddress,
    spenderAddress,
    amount,
}: ApproveEncodingParam): TransactionParam {
    return {
        to: tokenAddress,
        value: 0n,
        data: encodeFunctionData({
            abi: ERC20_WITH_PERMIT_ABI,
            functionName: 'approve',
            args: [spenderAddress, amount],
        }),
    };
}

export function encodePermitTransaction(permit: SignedPermit): TransactionParam {
    const { r, s, yParity } = parseSignature(permit.signature);
    return {
        to: permit.tokenAddress,
        value: 0n,
        data: encodeFunctionData({
            abi: ERC20_WITH_PERMIT_ABI,
            functionName: 'permit',
            args: [permit.ownerAddress, permit.spenderAddress, permit.amount, permit.deadline, yParity + 27, r, s],
        }),
    };
}
