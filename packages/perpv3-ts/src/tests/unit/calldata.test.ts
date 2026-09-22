import { decodeFunctionData } from 'viem';
import {
    CURRENT_GATE_ABI,
    CURRENT_GELATO_RELAY_ROUTER_ABI,
    CURRENT_INSTRUMENT_ABI,
    ERC20_WITH_PERMIT_ABI,
} from '../../abis';
import {
    createGateWriteRequest,
    createInstrumentWriteRequest,
    createRouterWriteRequest,
    createTokenWriteRequest,
    encodeGateWriteRequest,
    encodeInstrumentWriteRequest,
    encodeRouterWriteRequest,
    encodeTokenWriteRequest,
    contractCallEncoder,
} from '../../frontend/calldata';
import { encodeDepositTransaction, encodeWithdrawTransaction } from '../../frontend/calldata/account';
import {
    encodeCancelOrderTransaction,
    encodeMarketOrderTransaction,
    encodeSettleTransaction,
} from '../../frontend/calldata/instrument';
import { createInstrumentWriteRequest as createInstrumentWriteRequestFromModule } from '../../frontend/calldata/requests';
import { encodeApproveTransaction } from '../../frontend/calldata/token';
import { INSTRUMENT_OPERATION_METADATA } from '../../operations/instrument';
import type { TransactionParam as ModuleTransactionParam } from '../../frontend/calldata/types';
import { Side, UserSetting } from '../../types';
import { encodeDepositParam, encodeTradeParam, encodeWithdrawParam } from '../../utils/encode';

describe('frontend calldata typed requests', () => {
    it('encodes instrument calldata from a typed write request', () => {
        const instrumentAddress = '0x0000000000000000000000000000000000000011' as const;
        const traderAddress = '0x0000000000000000000000000000000000000022';
        const args = encodeTradeParam({
            expiry: 1_700_000_000,
            size: 1_000_000_000_000_000_000n,
            amount: 500_000_000_000_000_000n,
            limitTick: 100,
            deadline: 1_700_000_600,
        });

        const request = createInstrumentWriteRequest(instrumentAddress, 'tradeFor', [traderAddress, args]);
        const data = encodeInstrumentWriteRequest(request);
        const decoded = decodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, data });

        expect(request.address).toBe(instrumentAddress);
        expect(request.functionName).toBe('tradeFor');
        expect(decoded.functionName).toBe('tradeFor');
        expect(decoded.args).toEqual([traderAddress, args]);
    });

    it('exposes typed request helpers from the calldata requests module', () => {
        const instrumentAddress = '0x0000000000000000000000000000000000000011' as const;
        const args = encodeTradeParam({
            expiry: 1_700_000_000,
            size: 1_000_000_000_000_000_000n,
            amount: 500_000_000_000_000_000n,
            limitTick: 100,
            deadline: 1_700_000_600,
        });

        const request = createInstrumentWriteRequestFromModule(instrumentAddress, 'trade', [args]);

        expect(request.address).toBe(instrumentAddress);
        expect(request.functionName).toBe('trade');
    });

    it('exposes transaction types from the calldata types module', () => {
        const tx: ModuleTransactionParam = {
            to: '0x0000000000000000000000000000000000000011',
            data: '0x',
            value: 0n,
        };

        expect(tx.value).toBe(0n);
    });

    it('encodes gate calldata from a typed write request', () => {
        const gateAddress = '0x0000000000000000000000000000000000000033';
        const tokenAddress = '0x0000000000000000000000000000000000000044';
        const traderAddress = '0x0000000000000000000000000000000000000055';
        const args = encodeDepositParam(tokenAddress, 100n);

        const request = createGateWriteRequest(gateAddress, 'depositFor', [traderAddress, args]);
        const data = encodeGateWriteRequest(request);
        const decoded = decodeFunctionData({ abi: CURRENT_GATE_ABI, data });

        expect(request.address).toBe(gateAddress);
        expect(request.functionName).toBe('depositFor');
        expect(decoded.functionName).toBe('depositFor');
        expect(decoded.args).toEqual([traderAddress, args]);
    });

    it('uses ABI order for gate for-call encoding', () => {
        const gateAddress = '0x0000000000000000000000000000000000000066';
        const tokenAddress = '0x0000000000000000000000000000000000000077';
        const traderAddress = '0x0000000000000000000000000000000000000088';
        const amount = 100n;

        const depositTx = contractCallEncoder.encodeDeposit({ tokenAddress, amount }, gateAddress, {
            useDepositFor: true,
            traderAddress,
        });
        const withdrawTx = contractCallEncoder.encodeWithdraw({ tokenAddress, amount }, gateAddress, {
            useWithdrawFor: true,
            traderAddress,
        });

        const depositDecoded = decodeFunctionData({ abi: CURRENT_GATE_ABI, data: depositTx.data });
        const withdrawDecoded = decodeFunctionData({ abi: CURRENT_GATE_ABI, data: withdrawTx.data });

        expect(depositDecoded.functionName).toBe('depositFor');
        expect(depositDecoded.args).toEqual([traderAddress, encodeDepositParam(tokenAddress, amount)]);
        expect(withdrawDecoded.functionName).toBe('withdrawFor');
        expect(withdrawDecoded.args).toEqual([traderAddress, encodeWithdrawParam(tokenAddress, amount)]);
    });

    it('exposes account and token calldata intent encoders as direct modules', () => {
        const gateAddress = '0x0000000000000000000000000000000000000066';
        const tokenAddress = '0x0000000000000000000000000000000000000077';
        const spenderAddress = '0x0000000000000000000000000000000000000144';
        const amount = 100n;

        expect(encodeDepositTransaction({ tokenAddress, amount }, gateAddress)).toEqual(
            contractCallEncoder.encodeDeposit({ tokenAddress, amount }, gateAddress)
        );
        expect(encodeWithdrawTransaction({ tokenAddress, amount }, gateAddress)).toEqual(
            contractCallEncoder.encodeWithdraw({ tokenAddress, amount }, gateAddress)
        );
        expect(encodeApproveTransaction({ tokenAddress, spenderAddress, amount })).toEqual(
            contractCallEncoder.encodeApprove({ tokenAddress, spenderAddress, amount })
        );
    });

    it('exposes instrument calldata intent encoders as direct modules', () => {
        const instrumentAddress = '0x0000000000000000000000000000000000000011' as const;
        const targetAddress = '0x0000000000000000000000000000000000000122';
        const userSetting = new UserSetting(3600, 100, 3_000_000_000_000_000_000n);

        const marketParam = {
            instrumentAddress,
            expiry: 1_700_000_000,
            side: Side.LONG,
            baseQuantity: 1_000_000_000_000_000_000n,
            margin: 500_000_000_000_000_000n,
            limitTick: 100,
            userSetting,
        };

        expect(encodeMarketOrderTransaction(marketParam)).toEqual(contractCallEncoder.encodeMarketOrder(marketParam));
        expect(encodeSettleTransaction({ instrumentAddress, expiry: 1_700_000_000, targetAddress })).toEqual(
            contractCallEncoder.encodeSettle({ instrumentAddress, expiry: 1_700_000_000, targetAddress })
        );
    });

    it('centralizes instrument operation contract method metadata', () => {
        expect(INSTRUMENT_OPERATION_METADATA.marketOrder.write.direct.functionName).toBe('trade');
        expect(INSTRUMENT_OPERATION_METADATA.marketOrder.write.direct.label).toBe('trade');
        expect(INSTRUMENT_OPERATION_METADATA.marketOrder.param).toEqual({
            kind: 'packedTuple',
            codec: 'trade',
            tupleSize: 2,
            parserArgLabel: 'args',
        });
        expect(INSTRUMENT_OPERATION_METADATA.marketOrder.write.forCall).toEqual({
            functionName: 'tradeFor',
            label: 'tradeFor',
            argumentLayout: 'traderThenParam',
        });
        expect(INSTRUMENT_OPERATION_METADATA.marketOrder.write.routerBatch.functionName).toBe('batchMulticall');
        expect(INSTRUMENT_OPERATION_METADATA.marketOrder.write.routerBatch.label).toBe('batchMulticall');
        expect(INSTRUMENT_OPERATION_METADATA.limitOrder.write.direct.functionName).toBe('place');
        expect(INSTRUMENT_OPERATION_METADATA.limitOrder.write.direct.label).toBe('place');
        expect(INSTRUMENT_OPERATION_METADATA.limitOrder.write.forCall.functionName).toBe('placeFor');
        expect(INSTRUMENT_OPERATION_METADATA.limitOrder.write.forCall.label).toBe('placeFor');
        expect(INSTRUMENT_OPERATION_METADATA.cancelOrder.write.direct.functionName).toBe('cancel');
        expect(INSTRUMENT_OPERATION_METADATA.cancelOrder.write.direct.label).toBe('cancel');
        expect(INSTRUMENT_OPERATION_METADATA.cancelOrder.param).toEqual({
            kind: 'packedArg',
            codec: 'cancel',
            parserArgLabel: 'arg',
        });
        expect(INSTRUMENT_OPERATION_METADATA.cancelOrder.write.forCall.functionName).toBe('cancelFor');
        expect(INSTRUMENT_OPERATION_METADATA.cancelOrder.write.forCall.label).toBe('cancelFor');
        expect(INSTRUMENT_OPERATION_METADATA.cancelOrder.write.multicall.functionName).toBe('multicall');
        expect(INSTRUMENT_OPERATION_METADATA.cancelOrder.write.multicall.label).toBe('multicall');
        expect(INSTRUMENT_OPERATION_METADATA.fillLimitOrder.param).toEqual({
            kind: 'packedArg',
            codec: 'fill',
            parserArgLabel: 'arg',
        });
        expect(INSTRUMENT_OPERATION_METADATA.removeLiquidity.write.forCall).toEqual({
            functionName: 'removeFor',
            label: 'removeFor',
            argumentLayout: 'paramOnly',
        });
        expect(INSTRUMENT_OPERATION_METADATA.settle.param).toEqual({
            kind: 'structuredArgs',
            parserArgLabel: 'args',
        });
    });

    it('encodes router calldata from a typed write request', () => {
        const routerAddress = '0x0000000000000000000000000000000000000099';
        const subAccountAddress = '0x0000000000000000000000000000000000000100';
        const traderAddress = '0x0000000000000000000000000000000000000111';
        const targetAddress = '0x0000000000000000000000000000000000000122';
        const data = '0x1234';

        const request = createRouterWriteRequest(routerAddress, 'batchMulticall', [
            subAccountAddress,
            traderAddress,
            [targetAddress],
            [data],
            false,
        ]);
        const encoded = encodeRouterWriteRequest(request);
        const decoded = decodeFunctionData({ abi: CURRENT_GELATO_RELAY_ROUTER_ABI, data: encoded });

        expect(request.address).toBe(routerAddress);
        expect(request.functionName).toBe('batchMulticall');
        expect(decoded.functionName).toBe('batchMulticall');
        expect(decoded.args).toEqual([subAccountAddress, traderAddress, [targetAddress], [data], false]);
    });

    it('encodes token calldata from a typed write request', () => {
        const tokenAddress = '0x0000000000000000000000000000000000000133';
        const spenderAddress = '0x0000000000000000000000000000000000000144';
        const amount = 100n;

        const request = createTokenWriteRequest(tokenAddress, 'approve', [spenderAddress, amount]);
        const data = encodeTokenWriteRequest(request);
        const decoded = decodeFunctionData({ abi: ERC20_WITH_PERMIT_ABI, data });

        expect(request.address).toBe(tokenAddress);
        expect(request.functionName).toBe('approve');
        expect(decoded.functionName).toBe('approve');
        expect(decoded.args).toEqual([spenderAddress, amount]);
    });
});

test.each([0, -1, 1.5, 9, NaN, Infinity])('rejects invalid cancel batch size %s before grouping', (maxCancelCount) => {
    expect(() =>
        encodeCancelOrderTransaction(
            {
                instrumentAddress: '0x0000000000000000000000000000000000000011',
                expiry: 1,
                ticks: [1],
                userSetting: new UserSetting(60, 50, 3n * 10n ** 18n),
            },
            { maxCancelCount }
        )
    ).toThrow('maxCancelCount must be an integer between 1 and 8');
});
