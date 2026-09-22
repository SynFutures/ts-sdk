import { encodeFunctionData, type Abi, type Address, type Hex, type ContractFunctionParameters } from 'viem';
import type { TypedWriteRequest, WriteArgs, WriteFunctionName } from '@derivation-tech/viem-kit';
import {
    CURRENT_GATE_ABI,
    CURRENT_GELATO_RELAY_ROUTER_ABI,
    CURRENT_INSTRUMENT_ABI,
    ERC20_WITH_PERMIT_ABI,
} from '../../abis';

type WriteCall<
    TAbi extends Abi,
    TFunctionName extends WriteFunctionName<TAbi>,
    TArgs extends WriteArgs<TAbi, TFunctionName>,
> = {
    address: Address;
    abi: TAbi;
    functionName: TFunctionName;
    args: TArgs;
};

function createTypedWriteRequest<
    const TAbi extends Abi,
    const TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteArgs<TAbi, TFunctionName>,
>(address: Address, abi: TAbi, functionName: TFunctionName, args: TArgs): WriteCall<TAbi, TFunctionName, TArgs> {
    return { address, abi, functionName, args };
}

function encodeTypedWriteRequest(abi: Abi, request: unknown): Hex {
    if (typeof request !== 'object' || request === null) {
        throw new Error('Invalid typed write request: expected object');
    }
    const { functionName, args } = request as Record<string, unknown>;
    if (typeof functionName !== 'string') {
        throw new Error('Invalid typed write request: expected functionName');
    }
    if (args !== undefined && !Array.isArray(args)) {
        throw new Error('Invalid typed write request: expected args array');
    }

    return encodeFunctionData({
        abi,
        functionName,
        ...(args !== undefined ? { args } : {}),
    } as Parameters<typeof encodeFunctionData>[0]);
}

export type InstrumentWriteFunctionName = WriteFunctionName<typeof CURRENT_INSTRUMENT_ABI>;
export type GateWriteFunctionName = WriteFunctionName<typeof CURRENT_GATE_ABI>;
export type RouterWriteFunctionName = WriteFunctionName<typeof CURRENT_GELATO_RELAY_ROUTER_ABI>;
export type TokenWriteFunctionName = WriteFunctionName<typeof ERC20_WITH_PERMIT_ABI>;

export type InstrumentWriteRequest<
    TFunctionName extends InstrumentWriteFunctionName = InstrumentWriteFunctionName,
    TArgs extends WriteArgs<typeof CURRENT_INSTRUMENT_ABI, TFunctionName> = WriteArgs<
        typeof CURRENT_INSTRUMENT_ABI,
        TFunctionName
    >,
> = TypedWriteRequest<typeof CURRENT_INSTRUMENT_ABI, TFunctionName, TArgs>;

export type GateWriteRequest<
    TFunctionName extends GateWriteFunctionName = GateWriteFunctionName,
    TArgs extends WriteArgs<typeof CURRENT_GATE_ABI, TFunctionName> = WriteArgs<typeof CURRENT_GATE_ABI, TFunctionName>,
> = TypedWriteRequest<typeof CURRENT_GATE_ABI, TFunctionName, TArgs>;

export type RouterWriteRequest<
    TFunctionName extends RouterWriteFunctionName = RouterWriteFunctionName,
    TArgs extends WriteArgs<typeof CURRENT_GELATO_RELAY_ROUTER_ABI, TFunctionName> = WriteArgs<
        typeof CURRENT_GELATO_RELAY_ROUTER_ABI,
        TFunctionName
    >,
> = TypedWriteRequest<typeof CURRENT_GELATO_RELAY_ROUTER_ABI, TFunctionName, TArgs>;

export type TokenWriteRequest<
    TFunctionName extends TokenWriteFunctionName = TokenWriteFunctionName,
    TArgs extends WriteArgs<typeof ERC20_WITH_PERMIT_ABI, TFunctionName> = WriteArgs<
        typeof ERC20_WITH_PERMIT_ABI,
        TFunctionName
    >,
> = TypedWriteRequest<typeof ERC20_WITH_PERMIT_ABI, TFunctionName, TArgs>;

export function createInstrumentWriteRequest<
    const TFunctionName extends InstrumentWriteFunctionName,
    const TArgs extends WriteArgs<typeof CURRENT_INSTRUMENT_ABI, TFunctionName>,
>(
    address: Address,
    functionName: TFunctionName,
    args: TArgs
): WriteCall<typeof CURRENT_INSTRUMENT_ABI, TFunctionName, TArgs> {
    return createTypedWriteRequest(address, CURRENT_INSTRUMENT_ABI, functionName, args);
}

export function createGateWriteRequest<
    const TFunctionName extends GateWriteFunctionName,
    const TArgs extends WriteArgs<typeof CURRENT_GATE_ABI, TFunctionName>,
>(
    address: Address,
    functionName: TFunctionName,
    args: TArgs
): WriteCall<typeof CURRENT_GATE_ABI, TFunctionName, TArgs> {
    return createTypedWriteRequest(address, CURRENT_GATE_ABI, functionName, args);
}

export function createRouterWriteRequest<
    const TFunctionName extends RouterWriteFunctionName,
    const TArgs extends WriteArgs<typeof CURRENT_GELATO_RELAY_ROUTER_ABI, TFunctionName>,
>(
    address: Address,
    functionName: TFunctionName,
    args: TArgs
): WriteCall<typeof CURRENT_GELATO_RELAY_ROUTER_ABI, TFunctionName, TArgs> {
    return createTypedWriteRequest(address, CURRENT_GELATO_RELAY_ROUTER_ABI, functionName, args);
}

export function createTokenWriteRequest<
    const TFunctionName extends TokenWriteFunctionName,
    const TArgs extends WriteArgs<typeof ERC20_WITH_PERMIT_ABI, TFunctionName>,
>(
    address: Address,
    functionName: TFunctionName,
    args: TArgs
): WriteCall<typeof ERC20_WITH_PERMIT_ABI, TFunctionName, TArgs> {
    return createTypedWriteRequest(address, ERC20_WITH_PERMIT_ABI, functionName, args);
}

export function encodeInstrumentWriteRequest<const TFunctionName extends InstrumentWriteFunctionName>(
    request: ContractFunctionParameters<typeof CURRENT_INSTRUMENT_ABI, 'payable' | 'nonpayable', TFunctionName>
): Hex {
    return encodeTypedWriteRequest(CURRENT_INSTRUMENT_ABI, request);
}

export function encodeGateWriteRequest<const TFunctionName extends GateWriteFunctionName>(
    request: ContractFunctionParameters<typeof CURRENT_GATE_ABI, 'payable' | 'nonpayable', TFunctionName>
): Hex {
    return encodeTypedWriteRequest(CURRENT_GATE_ABI, request);
}

export function encodeRouterWriteRequest<const TFunctionName extends RouterWriteFunctionName>(
    request: ContractFunctionParameters<typeof CURRENT_GELATO_RELAY_ROUTER_ABI, 'payable' | 'nonpayable', TFunctionName>
): Hex {
    return encodeTypedWriteRequest(CURRENT_GELATO_RELAY_ROUTER_ABI, request);
}

export function encodeTokenWriteRequest<const TFunctionName extends TokenWriteFunctionName>(
    request: ContractFunctionParameters<typeof ERC20_WITH_PERMIT_ABI, 'payable' | 'nonpayable', TFunctionName>
): Hex {
    return encodeTypedWriteRequest(ERC20_WITH_PERMIT_ABI, request);
}

export function encodeInstrumentCall<const TFunctionName extends InstrumentWriteFunctionName>(
    _address: Address,
    functionName: TFunctionName,
    args: WriteArgs<typeof CURRENT_INSTRUMENT_ABI, TFunctionName>
): Hex {
    return encodeTypedWriteRequest(CURRENT_INSTRUMENT_ABI, { functionName, args });
}

export function encodeGateCall<const TFunctionName extends GateWriteFunctionName>(
    _address: Address,
    functionName: TFunctionName,
    args: WriteArgs<typeof CURRENT_GATE_ABI, TFunctionName>
): Hex {
    return encodeTypedWriteRequest(CURRENT_GATE_ABI, { functionName, args });
}

export function encodeRouterCall<const TFunctionName extends RouterWriteFunctionName>(
    _address: Address,
    functionName: TFunctionName,
    args: WriteArgs<typeof CURRENT_GELATO_RELAY_ROUTER_ABI, TFunctionName>
): Hex {
    return encodeTypedWriteRequest(CURRENT_GELATO_RELAY_ROUTER_ABI, { functionName, args });
}

export function encodeTokenCall<const TFunctionName extends TokenWriteFunctionName>(
    _address: Address,
    functionName: TFunctionName,
    args: WriteArgs<typeof ERC20_WITH_PERMIT_ABI, TFunctionName>
): Hex {
    return encodeTypedWriteRequest(ERC20_WITH_PERMIT_ABI, { functionName, args });
}
