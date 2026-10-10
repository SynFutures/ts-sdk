import { decodeFunctionData, type Hex } from 'viem';
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
const traderAddress = '0x0000000000000000000000000000000000000022' as const;
const routerAddress = '0x0000000000000000000000000000000000000099' as const;
const subAccountAddress = '0x0000000000000000000000000000000000000100' as const;
const now = 1_700_000_000;
const userSetting = new UserSetting(3600, 100, 3_000_000_000_000_000_000n);
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
        instrumentAddress,
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

    it('encodes a direct market order as a signed trade', () => {
        const tx = contractCallEncoder.encodeMarketOrder(marketParam);

        expect(tx).toMatchObject({ to: instrumentAddress, value: 0n });
        expect(decodeInstrument(tx.data)).toEqual({ functionName: 'trade', args: [tradeArgs] });
    });

    it('routes a tradeFor call through the router batch when a sub-account is configured', () => {
        const tx = contractCallEncoder.encodeMarketOrder(marketParam, {
            useTradeFor: true,
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
        expect(() => contractCallEncoder.encodeMarketOrder(marketParam, { useTradeFor: true })).toThrow(
            'traderAddress for tradeFor is required'
        );
    });

    it('encodes removeFor with the packed param only', () => {
        const removeParam = {
            instrumentAddress,
            expiry: 1_700_000_000,
            traderAddress,
            tickLower: -100,
            tickUpper: 100,
            limitTicks: 0,
            userSetting,
        };
        const tx = contractCallEncoder.encodeRemoveLiquidity(removeParam, { useRemoveFor: true });

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
            { instrumentAddress, expiry: 1, ticks, userSetting },
            { maxCancelCount: 2 }
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
                { instrumentAddress, expiry: 1, ticks: [1, 2, 3], userSetting },
                { maxCancelCount: 2, useCancelFor: true, traderAddress }
            )
        ).toThrow('Agent and router addresses required');
    });

    it('encodes a direct cross limit order as trade then place in one multicall', () => {
        const tx = contractCallEncoder.encodeCrossLimitOrder({
            instrumentAddress,
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
        const tx = contractCallEncoder.encodeSettle({ instrumentAddress, expiry: 1_700_000_000, targetAddress });

        expect(decodeInstrument(tx.data)).toEqual({ functionName: 'settle', args: [1_700_000_000, targetAddress] });
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

    describe('ERC-20 permit signatures', () => {
        const tokenAddress = '0x0000000000000000000000000000000000000077';
        const spenderAddress = '0x0000000000000000000000000000000000000144';
        const ownerAddress = '0x0000000000000000000000000000000000000055';
        const r = `0x${'11'.repeat(32)}` as const;
        const s = `0x${'22'.repeat(32)}` as const;
        const params = { tokenAddress, spenderAddress, amount: 100n } as const;
        const options = { useApproveFor: true, ownerAddress, deadline: 1_700_000_600 } as const;

        it.each([
            ['00', 27],
            ['01', 28],
            ['1b', 27],
            ['1c', 28],
        ] as const)('encodes signature suffix %s as contract recovery value %i', (suffix, expectedV) => {
            const signature = `${r}${s.slice(2)}${suffix}` as const;
            const tx = contractCallEncoder.encodeApprove(params, { ...options, signature });
            const decoded = decodeFunctionData({ abi: ERC20_WITH_PERMIT_ABI, data: tx.data });

            expect(tx.to).toBe(tokenAddress);
            expect(tx.value).toBe(0n);
            expect(decoded.functionName).toBe('permit');
            expect(decoded.args).toEqual([ownerAddress, spenderAddress, 100n, 1_700_000_600n, expectedV, r, s]);
        });

        it.each(['02', '1d', 'ff'])('rejects unsupported recovery value %s before encoding', (suffix) => {
            const signature = `${r}${s.slice(2)}${suffix}` as const;
            expect(() => contractCallEncoder.encodeApprove(params, { ...options, signature })).toThrow();
        });

        it.each(['0x1234', `0x${'00'.repeat(32)}${s.slice(2)}1b`] as const)(
            'rejects malformed or invalid signature %s before encoding',
            (signature) => {
                expect(() => contractCallEncoder.encodeApprove(params, { ...options, signature })).toThrow();
            }
        );
    });
});

test.each([0, -1, 1.5, 9, NaN, Infinity])('rejects invalid cancel batch size %s before grouping', (maxCancelCount) => {
    expect(() =>
        contractCallEncoder.encodeCancelOrder(
            {
                instrumentAddress,
                expiry: 1,
                ticks: [1],
                userSetting: new UserSetting(60, 50, 3n * 10n ** 18n),
            },
            { maxCancelCount }
        )
    ).toThrow('maxCancelCount must be an integer between 1 and 8');
});
