import { encodeFunctionData, ethAddress, zeroAddress } from 'viem';
import type { ContractDeployment } from '../../abis';
import { getABI, CURRENT_GATE_ABI, CURRENT_GELATO_RELAY_ROUTER_ABI } from '../../abis';
import { encodeDepositParam, encodeWithdrawParam } from '../../utils/encode';
import { isDelegated } from './shared';
import type { TransactionRoute, DepositEncodingParam, TransactionParam, WithdrawEncodingParam } from './types';

export function encodeDepositTransaction(
    param: DepositEncodingParam,
    gate: ContractDeployment,
    options?: TransactionRoute
): TransactionParam {
    const gateAddr = gate.address;
    const subAccountAddress = options?.subAccountAddress;
    const routerAddress = options?.routerAddress;

    const depositArg = encodeDepositParam(param.tokenAddress, param.amount);
    const isNativeToken =
        param.tokenAddress.toLowerCase() === ethAddress || param.tokenAddress.toLowerCase() === zeroAddress;
    const value = isNativeToken ? param.amount : 0n;

    if (isDelegated(options)) {
        if (gate.version === 'legacy') throw new Error('Legacy Gate does not support delegated transfers');
        const traderAddress = options.traderAddress;
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

    const calldata = encodeFunctionData({
        abi: getABI(gate.version, 'Gate'),
        functionName: 'deposit',
        args: [depositArg],
    });

    return {
        to: gateAddr,
        data: calldata,
        value,
    };
}

export function encodeWithdrawTransaction(
    param: WithdrawEncodingParam,
    gate: ContractDeployment,
    options?: TransactionRoute
): TransactionParam {
    const gateAddr = gate.address;
    const subAccountAddress = options?.subAccountAddress;
    const routerAddress = options?.routerAddress;

    const withdrawArg = encodeWithdrawParam(param.tokenAddress, param.amount);

    if (isDelegated(options)) {
        if (gate.version === 'legacy') throw new Error('Legacy Gate does not support delegated transfers');
        const traderAddress = options.traderAddress;
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

    const calldata = encodeFunctionData({
        abi: getABI(gate.version, 'Gate'),
        functionName: 'withdraw',
        args: [withdrawArg],
    });

    return {
        to: gateAddr,
        data: calldata,
        value: 0n,
    };
}
