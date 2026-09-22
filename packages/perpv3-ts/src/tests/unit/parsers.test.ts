import { encodeAddParam, encodeCancelParam, encodeDepositParam } from '../../utils/encode';
import {
    createCexMarketParser,
    createConfigParser,
    createDexV2MarketParser,
    createGateParser,
    createGuardianParser,
    createInstrumentParser,
} from '../../parsers';
import { createInstrumentEventParsers, createInstrumentTransactionParsers } from '../../parsers/instrument';
import { createFrontendInstrumentEventParsers, createFrontendInstrumentParser } from '../../frontend/parsers';
import type { ContractParser, DecodedContractError } from '@derivation-tech/viem-kit';
import { CURRENT_INSTRUMENT_ABI } from '../../abis';
import { INSTRUMENT_OPERATION_METADATA } from '../../operations/instrument';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
type InstrumentParser = ContractParser<typeof CURRENT_INSTRUMENT_ABI>;
type ParseEventInput = Parameters<NonNullable<InstrumentParser['parseEvent']>>[0];

describe('SynFutures parser integration', () => {
    it('builds instrument transaction handlers as a table', () => {
        const handlers = createInstrumentTransactionParsers();

        expect(Object.keys(handlers)).toEqual(
            expect.arrayContaining([
                'add',
                'trade',
                'place',
                'cancel',
                'setQuoteParam',
                'donateInsuranceFund',
                'claimProtocolFee',
            ])
        );
    });

    it('keeps instrument operation parser labels in metadata', () => {
        const metadata = INSTRUMENT_OPERATION_METADATA;
        const calls = [
            metadata.marketOrder.write.direct,
            metadata.marketOrder.write.forCall,
            metadata.marketOrder.write.routerBatch,
            metadata.limitOrder.write.direct,
            metadata.limitOrder.write.forCall,
            metadata.cancelOrder.write.direct,
            metadata.cancelOrder.write.forCall,
            metadata.cancelOrder.write.multicall,
            metadata.cancelOrder.write.routerBatch,
            metadata.adjustMargin.write.direct,
            metadata.adjustMargin.write.forCall,
            metadata.adjustMargin.write.routerBatch,
            metadata.batchPlaceScaledLimitOrder.write.direct,
            metadata.batchPlaceScaledLimitOrder.write.forCall,
            metadata.batchPlaceScaledLimitOrder.write.routerBatch,
            metadata.crossLimitOrder.write.trade.direct,
            metadata.crossLimitOrder.write.trade.forCall,
            metadata.crossLimitOrder.write.place.direct,
            metadata.crossLimitOrder.write.place.forCall,
            metadata.crossLimitOrder.write.multicall,
            metadata.crossLimitOrder.write.routerBatch,
            metadata.fillLimitOrder.write.direct,
            metadata.addLiquidity.write.direct,
            metadata.addLiquidity.write.forCall,
            metadata.addLiquidity.write.routerBatch,
            metadata.removeLiquidity.write.direct,
            metadata.removeLiquidity.write.forCall,
            metadata.removeLiquidity.write.routerBatch,
            metadata.settle.write.direct,
        ] satisfies ReadonlyArray<{ functionName: string; label?: string }>;

        for (const call of calls) {
            expect(call.label).toBe(call.functionName);
        }
    });

    it('builds instrument event handlers as a table', () => {
        const handlers = createInstrumentEventParsers();

        expect(Object.keys(handlers)).toEqual(
            expect.arrayContaining(['Add', 'Trade', 'Place', 'Fill', 'Cancel', 'UpdateFundingIndex'])
        );
    });

    it('builds frontend instrument event handlers as a table', () => {
        const handlers = createFrontendInstrumentEventParsers();

        expect(Object.keys(handlers)).toEqual(expect.arrayContaining(['Add', 'Remove', 'Trade', 'Place', 'Adjust']));
    });

    it('formats instrument add transactions', async () => {
        const parser: InstrumentParser = createInstrumentParser();
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

    it('formats operation calls with labels from metadata', async () => {
        const operation = INSTRUMENT_OPERATION_METADATA.addLiquidity.write.direct as {
            functionName: 'add';
            label?: string;
        };
        const previousLabel = operation.label;
        operation.label = 'metadataAdd';

        try {
            const parser: InstrumentParser = createInstrumentParser();
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
                functionName: operation.functionName,
                args: [encodedArgs],
            });

            expect(formatted).toContain('metadataAdd(');
        } finally {
            if (previousLabel === undefined) {
                delete operation.label;
            } else {
                operation.label = previousLabel;
            }
        }
    });

    it('formats instrument cancelFor transactions with beneficiary address', async () => {
        const parser: InstrumentParser = createInstrumentParser({
            async resolveAddress(address) {
                return address === ZERO_ADDRESS ? 'ZERO' : 'UNKNOWN';
            },
        });
        const parseTransaction = parser.parseTransaction;
        if (!parseTransaction) {
            throw new Error('parseTransaction is not implemented');
        }
        const encodedArgs = encodeCancelParam({
            ticks: [100],
            expiry: 1_700_000_000,
            deadline: 1_700_000_600,
        });

        const formatted = await parseTransaction({
            functionName: 'cancelFor',
            args: [ZERO_ADDRESS, encodedArgs],
        });

        expect(formatted).toContain('cancelFor(');
        expect(formatted).toContain('to: [ZERO]');
        expect(formatted).toContain('expiry: 20231114');
        expect(formatted).toContain('ticks: [100');
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
        const parser: InstrumentParser = createInstrumentParser();
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
        } as ParseEventInput);

        expect(formatted).toContain('Trade(');
        expect(formatted).toContain('size: 1');
        expect(formatted).toContain('feeRatio: 1%');
    });

    it('formats frontend instrument events from shared parser surface', async () => {
        const parser = createFrontendInstrumentParser();
        const parseEvent = parser.parseEvent;
        if (!parseEvent) {
            throw new Error('parseEvent is not implemented');
        }

        const formatted = await parseEvent({
            eventName: 'Add',
            args: {
                tickLower: 0,
                tickUpper: 1,
                range: {
                    balance: 1_000_000_000_000_000_000n,
                },
            },
        } as Parameters<typeof parseEvent>[0]);

        expect(JSON.parse(formatted ?? '{}')).toMatchObject({
            balance: '1',
        });
    });

    it('formats representative config, guardian, cex market, and dex market parser outputs', async () => {
        const deps = {
            async resolveAddress(address: string) {
                return address === ZERO_ADDRESS ? 'ZERO' : 'UNKNOWN';
            },
            async getTokenInfo() {
                return undefined;
            },
        };

        const config = createConfigParser(deps);
        await expect(
            config.parseTransaction?.({
                functionName: 'disableLiquidatorWhitelist',
                args: [],
            })
        ).resolves.toBe('disableLiquidatorWhitelist()');

        const guardian = createGuardianParser(deps);
        await expect(
            guardian.parseEvent?.({
                eventName: 'SetToAddress',
                args: { to: ZERO_ADDRESS },
            } as Parameters<NonNullable<typeof guardian.parseEvent>>[0])
        ).resolves.toContain('ZERO');

        const cex = createCexMarketParser(deps);
        await expect(
            cex.parseTransaction?.({
                functionName: 'clearStates',
                args: [1_700_000_000],
            })
        ).resolves.toContain('clearStates');

        const dex = createDexV2MarketParser(deps);
        await expect(
            dex.parseEvent?.({
                eventName: 'AddDexV2Factory',
                args: {
                    factory: ZERO_ADDRESS,
                    number: 1n,
                },
            } as Parameters<NonNullable<typeof dex.parseEvent>>[0])
        ).resolves.toContain('AddDexV2Factory');
    });

    it('formats instrument errors with parameters', async () => {
        const parser: InstrumentParser = createInstrumentParser();
        const parseError = parser.parseError;
        if (!parseError) {
            throw new Error('parseError is not implemented');
        }
        const error: DecodedContractError = {
            kind: 'custom',
            name: 'OrderImrUnsafe',
            args: [1_000_000_000_000_000_000n, 2_000_000_000_000_000_000n],
            message: 'OrderImrUnsafe',
        };
        const formatted = await parseError(error);

        expect(formatted).toBe('OrderImrUnsafe(amount: 1, minAmount: 2)');
    });
});

test.each([1n, -1n, 0n])('serializes frontend Trade at signed size %s', async (direction) => {
    const parser = createFrontendInstrumentParser();
    const formatted = await parser.parseEvent?.({
        eventName: 'Trade',
        args: { size: direction * 10n ** 18n, entryNotional: 2n * 10n ** 18n, sqrtPX96: 2n ** 96n },
    } as ParseEventInput);
    expect(JSON.parse(formatted ?? '{}')).toMatchObject({
        tradeType: direction > 0n ? 'buy' : 'sell',
        tradePriceB: direction === 0n ? '0' : '2000000000000000000',
    });
});
