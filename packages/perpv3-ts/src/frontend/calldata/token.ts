import { encodeFunctionData, parseSignature, type Hex } from 'viem';
import { ERC20_WITH_PERMIT_ABI } from '../../abis';
import { Errors, ErrorCode } from '../../types';
import { requireAddress } from './shared';
import type { ApproveEncodingOptions, ApproveEncodingParam, TransactionParam } from './types';

export function encodeApproveTransaction(
    params: ApproveEncodingParam,
    options?: ApproveEncodingOptions
): TransactionParam {
    let calldata: Hex;

    if (options?.useApproveFor) {
        if (!options.signature) {
            throw Errors.validation('Signature is required for approveFor', ErrorCode.INVALID_PARAM);
        }
        if (options.deadline === undefined) {
            throw Errors.invalidDeadline(options.deadline ?? -1);
        }
        const ownerAddress = requireAddress(options.ownerAddress, 'ownerAddress for approveFor');

        const { r, s, yParity } = parseSignature(options.signature);

        calldata = encodeFunctionData({
            abi: ERC20_WITH_PERMIT_ABI,
            functionName: 'permit',
            args: [ownerAddress, params.spenderAddress, params.amount, BigInt(options.deadline), yParity + 27, r, s],
        });
    } else {
        calldata = encodeFunctionData({
            abi: ERC20_WITH_PERMIT_ABI,
            functionName: 'approve',
            args: [params.spenderAddress, params.amount],
        });
    }

    return {
        to: params.tokenAddress,
        data: calldata,
        value: 0n,
    };
}
