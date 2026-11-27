import { signErc20PermitTypedData } from '../../frontend/signature';
import {
    decodeFunctionData,
    createWalletClient,
    custom,
    encodeAbiParameters,
    toFunctionSelector,
    type Hex,
} from 'viem';
import {
    CURRENT_GATE_ABI,
    CURRENT_GELATO_RELAY_ROUTER_ABI,
    CURRENT_INSTRUMENT_ABI,
    ERC20_WITH_PERMIT_ABI,
} from '../../abis';
import { contractCallEncoder } from '../../frontend/calldata';
import { Side, UserSetting } from '../../types';
import {
    encodeCancelParam,
    encodeDepositParam,
    encodePlaceParam,
    encodeRemoveParam,
    encodeTradeParam,
    encodeWithdrawParam,
} from '../../utils/encode';

const instrumentAddress = '0x0000000000000000000000000000000000000011' as const;
const instrument = { address: instrumentAddress, version: 'current' } as const;
const traderAddress = '0x0000000000000000000000000000000000000022' as const;
const routerAddress = '0x0000000000000000000000000000000000000099' as const;
const subAccountAddress = '0x0000000000000000000000000000000000000100' as const;
const now = 1_700_000_000;
const userSetting = new UserSetting({
    deadlineSeconds: 3600,
    slippageBps: 100,
    leverageWad: 3_000_000_000_000_000_000n,
});
const deadline = now + 3600;
const decodeInstrument = (data: Hex) => decodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, data });
const decodeRouter = (data: Hex) => decodeFunctionData({ abi: CURRENT_GELATO_RELAY_ROUTER_ABI, data });

beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('frontend calldata encoding', () => {
    const marketParam = {
        instrument,
        expiry: 1_700_000_000,
        side: Side.SHORT,
        baseQuantity: 1_000_000_000_000_000_000n,
        margin: 500_000_000_000_000_000n,
        limitTick: 100,
        userSetting,
    } as const;
    const tradeArgs = encodeTradeParam({
        expiry: marketParam.expiry,
        size: -marketParam.baseQuantity,
        amount: marketParam.margin,
        limitTick: marketParam.limitTick,
        deadline,
    });

    it('rejects a delegated trade on a legacy instrument before sending calldata', () => {
        expect(() =>
            contractCallEncoder.encodeMarketOrder(
                { ...marketParam, instrument: { ...instrument, version: 'legacy' } },
                { route: 'for', traderAddress }
            )
        ).toThrow('tradeFor');
    });

    it('encodes a direct market order as a signed trade', () => {
        const tx = contractCallEncoder.encodeMarketOrder(marketParam);

        expect(tx).toMatchObject({ to: instrumentAddress, value: 0n });
        expect(() => contractCallEncoder.encodeMarketOrder(marketParam, { useTradeFor: true } as never)).toThrow(
            'Unknown transaction route'
        );
        expect(decodeInstrument(tx.data)).toEqual({ functionName: 'trade', args: [tradeArgs] });
    });

    it('routes a tradeFor call through the router batch when a sub-account is configured', () => {
        const tx = contractCallEncoder.encodeMarketOrder(marketParam, {
            route: 'router',
            traderAddress,
            subAccountAddress,
            routerAddress,
        });
        const routed = decodeRouter(tx.data);

        expect(tx.to).toBe(routerAddress);
        expect(routed.functionName).toBe('batchMulticall');
        const [account, trader, targets, callDatas, revertOnFailure] = routed.args as readonly [
            string,
            string,
            readonly string[],
            readonly Hex[],
            boolean,
        ];
        expect([account, trader, targets, revertOnFailure]).toEqual([
            subAccountAddress,
            traderAddress,
            [instrumentAddress],
            false,
        ]);
        expect(decodeInstrument(callDatas[0])).toEqual({ functionName: 'tradeFor', args: [traderAddress, tradeArgs] });
    });

    it('requires a trader address for for-calls', () => {
        expect(() => contractCallEncoder.encodeMarketOrder(marketParam, { route: 'for' } as never)).toThrow(
            'traderAddress is required'
        );
    });

    it('encodes removeFor with the packed param only', () => {
        const removeParam = {
            instrument,
            expiry: 1_700_000_000,
            traderAddress,
            tickLower: -100,
            tickUpper: 100,
            limitTicks: 0,
            userSetting,
        };
        const tx = contractCallEncoder.encodeRemoveLiquidity(removeParam, { route: 'for', traderAddress });

        expect(tx.to).toBe(instrumentAddress);
        expect(decodeInstrument(tx.data)).toEqual({
            functionName: 'removeFor',
            args: [
                encodeRemoveParam({
                    expiry: removeParam.expiry,
                    target: traderAddress,
                    tickLower: removeParam.tickLower,
                    tickUpper: removeParam.tickUpper,
                    limitTicks: removeParam.limitTicks,
                    deadline,
                }),
            ],
        });
    });

    it('splits cancellations above the batch size into an instrument multicall', () => {
        const ticks = [1, 2, 3];
        const tx = contractCallEncoder.encodeCancelOrder(
            { instrument, expiry: 1, ticks, userSetting },
            { route: 'direct', maxCancelCount: 2 }
        );
        const multicall = decodeInstrument(tx.data);

        expect(multicall.functionName).toBe('multicall');
        const [callDatas] = multicall.args as readonly [readonly Hex[]];
        expect(callDatas.map(decodeInstrument)).toEqual([
            { functionName: 'cancel', args: [encodeCancelParam({ expiry: 1, ticks: [1, 2], deadline })] },
            { functionName: 'cancel', args: [encodeCancelParam({ expiry: 1, ticks: [3], deadline })] },
        ]);
    });

    it('requires router addresses for batched cancelFor calls', () => {
        expect(() =>
            contractCallEncoder.encodeCancelOrder(
                { instrument, expiry: 1, ticks: [1, 2, 3], userSetting },
                { maxCancelCount: 2, route: 'for', traderAddress }
            )
        ).toThrow('Agent and router addresses required');
    });

    it('encodes a direct cross limit order as trade then place in one multicall', () => {
        const tx = contractCallEncoder.encodeCrossLimitOrder({
            instrument,
            expiry: 1_700_000_000,
            side: Side.LONG,
            tradeSize: 1n,
            tradeMargin: 2n,
            tradeLimitTick: 10,
            orderSize: 3n,
            orderMargin: 4n,
            orderTick: 20,
            userSetting,
        });
        const [callDatas] = decodeInstrument(tx.data).args as readonly [readonly Hex[]];

        expect(callDatas.map(decodeInstrument)).toEqual([
            {
                functionName: 'trade',
                args: [encodeTradeParam({ expiry: 1_700_000_000, size: 1n, amount: 2n, limitTick: 10, deadline })],
            },
            {
                functionName: 'place',
                args: [encodePlaceParam({ expiry: 1_700_000_000, size: 3n, amount: 4n, tick: 20, deadline })],
            },
        ]);
    });

    it('encodes settle arguments in ABI order', () => {
        const targetAddress = '0x0000000000000000000000000000000000000122';
        const tx = contractCallEncoder.encodeSettle({ instrument, expiry: 1_700_000_000, targetAddress });

        expect(decodeInstrument(tx.data)).toEqual({ functionName: 'settle', args: [1_700_000_000, targetAddress] });
    });

    it('forwards a native deposit through the requested router and preserves its value', () => {
        const gate = { address: '0x0000000000000000000000000000000000000066', version: 'current' } as const;
        const tokenAddress = '0x0000000000000000000000000000000000000000';
        const tx = contractCallEncoder.encodeDeposit({ tokenAddress, amount: 75n }, gate, {
            route: 'router',
            routerAddress,
            subAccountAddress,
            traderAddress,
        });
        expect(tx).toMatchObject({ to: routerAddress, value: 75n });
        const outer = decodeRouter(tx.data);
        const [sub, trader, target, inner, strict] = outer.args as readonly [string, string, string, Hex, boolean];
        expect([outer.functionName, sub, trader, target, strict]).toEqual([
            'batch',
            subAccountAddress,
            traderAddress,
            gate.address,
            false,
        ]);
        expect(decodeFunctionData({ abi: CURRENT_GATE_ABI, data: inner })).toEqual({
            functionName: 'depositFor',
            args: [traderAddress, encodeDepositParam(tokenAddress, 75n)],
        });
    });

    it('uses ABI order for gate for-call encoding', () => {
        const gateAddress = { address: '0x0000000000000000000000000000000000000066', version: 'current' } as const;
        const tokenAddress = '0x0000000000000000000000000000000000000077';
        const traderAddress = '0x0000000000000000000000000000000000000088';
        const amount = 100n;

        const depositTx = contractCallEncoder.encodeDeposit({ tokenAddress, amount }, gateAddress, {
            route: 'for',
            traderAddress,
        });
        const withdrawTx = contractCallEncoder.encodeWithdraw({ tokenAddress, amount }, gateAddress, {
            route: 'for',
            traderAddress,
        });

        expect(() =>
            contractCallEncoder.encodeDeposit({ tokenAddress, amount }, gateAddress, {
                route: 'router',
                traderAddress,
                routerAddress,
            } as never)
        ).toThrow('subAccountAddress is required');
        expect(() =>
            contractCallEncoder.encodeDeposit(
                { tokenAddress, amount },
                { ...gateAddress, version: 'legacy' },
                { route: 'for', traderAddress }
            )
        ).toThrow('Legacy Gate');
        const depositDecoded = decodeFunctionData({ abi: CURRENT_GATE_ABI, data: depositTx.data });
        const withdrawDecoded = decodeFunctionData({ abi: CURRENT_GATE_ABI, data: withdrawTx.data });

        expect(depositDecoded.functionName).toBe('depositFor');
        expect(depositDecoded.args).toEqual([traderAddress, encodeDepositParam(tokenAddress, amount)]);
        expect(withdrawDecoded.functionName).toBe('withdrawFor');
        expect(withdrawDecoded.args).toEqual([traderAddress, encodeWithdrawParam(tokenAddress, amount)]);
    });

    describe('ERC-20 permit signatures', () => {
        const tokenAddress = '0x0000000000000000000000000000000000000077';
        const spenderAddress = '0x0000000000000000000000000000000000000144';
        const ownerAddress = '0x0000000000000000000000000000000000000055';
        const r = `0x${'11'.repeat(32)}` as const;
        const s = `0x${'22'.repeat(32)}` as const;
        const params = { tokenAddress, spenderAddress, amount: 100n } as const;
        const options = { ownerAddress, deadline: 1_700_000_600n } as const;

        it.each([undefined, 0n])('encodes the deadline passed to the signer (%s)', async (deadline) => {
            let signed: { message: { deadline: string; owner: string; spender: string; value: string } } | undefined;
            const walletClient = createWalletClient({
                account: ownerAddress,
                transport: custom({
                    request: async ({ method, params: rpcParams }) => {
                        if (method === 'eth_call') {
                            const [call] = rpcParams as [{ data: string }];
                            return call.data === toFunctionSelector('name()')
                                ? encodeAbiParameters([{ type: 'string' }], ['Mock token'])
                                : encodeAbiParameters([{ type: 'uint256' }], [2n]);
                        }
                        if (method === 'eth_signTypedData_v4') {
                            const [, typedData] = rpcParams as [string, string];
                            signed = JSON.parse(typedData);
                            return `${r}${s.slice(2)}1b`;
                        }
                        throw new Error('Unexpected RPC method ' + method);
                    },
                }),
            });
            const permit = await signErc20PermitTypedData({
                ...params,
                ownerAddress,
                chainId: 8453,
                walletClient,
                approveAmount: params.amount,
                deadline,
            });
            const tx = contractCallEncoder.encodePermit(permit);
            expect(permit.deadline).toBe(deadline ?? BigInt(now + 3600));
            expect(signed?.message).toMatchObject({
                owner: ownerAddress,
                spender: spenderAddress,
                value: '100',
                deadline: String(permit.deadline),
            });
            expect(decodeFunctionData({ abi: ERC20_WITH_PERMIT_ABI, data: tx.data }).args).toEqual([
                ownerAddress,
                spenderAddress,
                100n,
                permit.deadline,
                27,
                r,
                s,
            ]);
        });

        it.each([
            ['00', 27],
            ['01', 28],
            ['1b', 27],
            ['1c', 28],
        ] as const)('encodes signature suffix %s as contract recovery value %i', (suffix, expectedV) => {
            const signature = `${r}${s.slice(2)}${suffix}` as const;
            const tx = contractCallEncoder.encodePermit({ ...params, ...options, signature });
            const decoded = decodeFunctionData({ abi: ERC20_WITH_PERMIT_ABI, data: tx.data });

            expect(tx.to).toBe(tokenAddress);
            expect(tx.value).toBe(0n);
            expect(decoded.functionName).toBe('permit');
            expect(decoded.args).toEqual([ownerAddress, spenderAddress, 100n, 1_700_000_600n, expectedV, r, s]);
        });

        it.each(['02', '1d', 'ff'])('rejects unsupported recovery value %s before encoding', (suffix) => {
            const signature = `${r}${s.slice(2)}${suffix}` as const;
            expect(() => contractCallEncoder.encodePermit({ ...params, ...options, signature })).toThrow();
        });

        it.each(['0x1234', `0x${'00'.repeat(32)}${s.slice(2)}1b`] as const)(
            'rejects malformed or invalid signature %s before encoding',
            (signature) => {
                expect(() => contractCallEncoder.encodePermit({ ...params, ...options, signature })).toThrow();
            }
        );
    });
});

test.each([0, -1, 1.5, 9, NaN, Infinity])('rejects invalid cancel batch size %s before grouping', (maxCancelCount) => {
    expect(() =>
        contractCallEncoder.encodeCancelOrder(
            {
                instrument,
                expiry: 1,
                ticks: [1],
                userSetting: new UserSetting({ deadlineSeconds: 60, slippageBps: 50, leverageWad: 3n * 10n ** 18n }),
            },
            { route: 'direct', maxCancelCount }
        )
    ).toThrow('maxCancelCount must be an integer between 1 and 8');
});
