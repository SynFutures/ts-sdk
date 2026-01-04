import { encodeAddParam, encodeDepositParam } from '../utils/encode';
import { createInstrumentParser, createGateParser } from '../parsers';
import type { ContractParser } from '@derivation-tech/viem-kit';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
type ParseEventInput = Parameters<NonNullable<ContractParser['parseEvent']>>[0];
type ParseErrorInput = Parameters<NonNullable<ContractParser['parseError']>>[0];

describe('SynFutures parser integration', () => {
    it('formats instrument add transactions', async () => {
        const parser: ContractParser = createInstrumentParser();
        const parseTransaction = parser.parseTransaction;
        if (!parseTransaction) {
            throw new Error('parseTransaction is not implemented');
        }
        const encodedArgs = encodeAddParam({
            limitTicks: 0,
            amount: 1_000_000_000_000_000_000n,
            tickDeltaLower: 5,
            tickDeltaUpper: 10,
            expiry: 1_700_000_000,
            deadline: 1_700_000_600,
        });

        const formatted = await parseTransaction({
            functionName: 'add',
            args: [encodedArgs],
        });

        expect(formatted).toContain('add(');
        expect(formatted).toContain('expiry: 20231114');
        expect(formatted).toContain('amount: 1');
    });

    it('formats gate deposit transactions with token metadata', async () => {
        const parser = createGateParser({
            nativeTokenAddress: ZERO_ADDRESS,
            async resolveAddress(address) {
                return address === ZERO_ADDRESS ? 'NATIVE' : 'UNKNOWN';
            },
            async getTokenInfo(symbolOrAddress) {
                if (symbolOrAddress === '0x00000000000000000000000000000000000000f1') {
                    return {
                        address: symbolOrAddress,
                        symbol: 'USDC',
                        name: 'USD Coin',
                        decimals: 6,
                    };
                }
                return undefined;
            },
        });

        const token = '0x00000000000000000000000000000000000000f1';
        const arg = encodeDepositParam(token, 5_000_000n);
        const parseTransaction = parser.parseTransaction;
        if (!parseTransaction) {
            throw new Error('parseTransaction is not implemented');
        }

        const formatted = await parseTransaction({
            functionName: 'deposit',
            args: [arg] as const,
        });

        expect(formatted).toContain('deposit(');
        expect(formatted).toContain('quantity: 5 USDC');
    });

    it('formats instrument trade events', async () => {
        const parser: ContractParser = createInstrumentParser();
        const parseEvent = parser.parseEvent;
        if (!parseEvent) {
            throw new Error('parseEvent is not implemented');
        }
        const formatted = await parseEvent({
            eventName: 'Trade',
            args: {
                expiry: 1_700_000_000,
                trader: ZERO_ADDRESS,
                size: 1_000_000_000_000_000_000n,
                amount: 2_000_000_000_000_000_000n,
                takenSize: 500_000_000_000_000_000n,
                takenValue: 1_000_000_000_000_000_000n,
                entryNotional: 3_000_000_000_000_000_000n,
                feeRatio: 100,
                sqrtPX96: 1n,
                mark: 4_000_000_000_000_000_000n,
            },
        } as unknown as ParseEventInput);

        expect(formatted).toContain('Trade(');
        expect(formatted).toContain('size: 1');
        expect(formatted).toContain('feeRatio: 1%');
    });

    it('formats instrument errors with parameters', async () => {
        const parser: ContractParser = createInstrumentParser();
        const parseError = parser.parseError;
        if (!parseError) {
            throw new Error('parseError is not implemented');
        }
        const formatted = await parseError({
            name: 'OrderImrUnsafe',
            args: [1_000_000_000_000_000_000n, 2_000_000_000_000_000_000n],
        } as unknown as ParseErrorInput);

        expect(formatted).toBe('OrderImrUnsafe(amount: 1, minAmount: 2)');
    });
});
