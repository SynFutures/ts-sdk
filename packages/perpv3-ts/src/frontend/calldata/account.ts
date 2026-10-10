import { encodeFunctionData, ethAddress, zeroAddress, type Address } from 'viem';
import { CURRENT_GATE_ABI, CURRENT_GELATO_RELAY_ROUTER_ABI } from '../../abis';
import { encodeDepositParam, encodeWithdrawParam } from '../../utils/encode';
import { requireAddress } from './shared';
import type {
    DepositEncodingOptions,
    DepositEncodingParam,
    TransactionParam,
    WithdrawEncodingOptions,
    WithdrawEncodingParam,
} from './types';

export function encodeDepositTransaction(
    param: DepositEncodingParam,
    gateAddr: Address,
    options?: DepositEncodingOptions
): TransactionParam {
    const useDepositFor = options?.useDepositFor ?? false;
    const subAccountAddress = options?.subAccountAddress;
    const routerAddress = options?.routerAddress;

    const depositArg = encodeDepositParam(param.tokenAddress, param.amount);
    const isNativeToken =
        param.tokenAddress.toLowerCase() === ethAddress || param.tokenAddress.toLowerCase() === zeroAddress;
    const value = isNativeToken ? param.amount : 0n;

    if (useDepositFor) {
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for depositFor');
        const depositForCalldata = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'depositFor',
            args: [traderAddress, depositArg],
        });

        if (subAccountAddress && routerAddress) {
            const batchData = encodeFunctionData({
                abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                functionName: 'batch',
                args: [subAccountAddress, traderAddress, gateAddr, depositForCalldata, false],
            });

            return {
                to: routerAddress,
                data: batchData,
                value,
            };
        }

        return {
            to: gateAddr,
            data: depositForCalldata,
            value,
        };
    }

    const calldata = encodeFunctionData({ abi: CURRENT_GATE_ABI, functionName: 'deposit', args: [depositArg] });

    return {
        to: gateAddr,
        data: calldata,
        value,
    };
}

export function encodeWithdrawTransaction(
    param: WithdrawEncodingParam,
    gateAddr: Address,
    options?: WithdrawEncodingOptions
): TransactionParam {
    const useWithdrawFor = options?.useWithdrawFor ?? false;
    const subAccountAddress = options?.subAccountAddress;
    const routerAddress = options?.routerAddress;

    const withdrawArg = encodeWithdrawParam(param.tokenAddress, param.amount);

    if (useWithdrawFor) {
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for withdrawFor');
        const withdrawForCalldata = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'withdrawFor',
            args: [traderAddress, withdrawArg],
        });

        if (subAccountAddress && routerAddress) {
            const batchData = encodeFunctionData({
                abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                functionName: 'batch',
                args: [subAccountAddress, traderAddress, gateAddr, withdrawForCalldata, false],
            });

            return {
                to: routerAddress,
                data: batchData,
                value: 0n,
            };
        }

        return {
            to: gateAddr,
            data: withdrawForCalldata,
            value: 0n,
        };
    }

    const calldata = encodeFunctionData({ abi: CURRENT_GATE_ABI, functionName: 'withdraw', args: [withdrawArg] });

    return {
        to: gateAddr,
        data: calldata,
        value: 0n,
    };
}
