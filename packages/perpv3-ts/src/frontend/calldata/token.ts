import type { Hex } from 'viem';
import { Errors, ErrorCode } from '../../types';
import { splitSignature } from '../signature';
import { encodeTokenCall } from './requests';
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

        const { r, s, v } = splitSignature(options.signature);

        calldata = encodeTokenCall(params.tokenAddress, 'permit', [
            ownerAddress,
            params.spenderAddress,
            params.amount,
            BigInt(options.deadline),
            v,
            r,
            s,
        ]);
    } else {
        calldata = encodeTokenCall(params.tokenAddress, 'approve', [params.spenderAddress, params.amount]);
    }

    return {
        to: params.tokenAddress,
        data: calldata,
        value: 0n,
    };
}
