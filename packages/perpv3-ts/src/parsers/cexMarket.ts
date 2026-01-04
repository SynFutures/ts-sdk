import type { Address, ContractParser } from '@derivation-tech/viem-kit';
import { formatAddress, formatExpiry, formatTimestamp, formatWad } from '../utils/format';
import { formatFeederType } from './enums';
import type { ParserDeps } from './types';
import { CEX_MARKET_ABI } from '../abis';

function stringify(values: readonly unknown[]): string {
    return values.map((value) => String(value)).join(', ');
}

export function createCexMarketParser(deps?: ParserDeps): ContractParser {
    return {
        abi: CEX_MARKET_ABI,

        async parseTransaction({ functionName, args }) {
            switch (functionName) {
                case 'clearStates': {
                    const [expiry] = args as readonly [number | bigint];
                    return `clearStates(expiry: ${formatExpiry(Number(expiry))})`;
                }
                case 'setFeeder': {
                    const [instruments, priceFeeders] = args as readonly [Address[], Array<any>];
                    const entries = await Promise.all(
                        instruments.map(async (instrument, idx) => {
                            const feeder = priceFeeders[idx];
                            const payload = [
                                `ftype: ${formatFeederType(feeder.ftype)}`,
                                `scaler0: ${feeder.scaler0}`,
                                `aggregator0: ${await formatAddress(feeder.aggregator0, deps)}`,
                                `heartBeat0: ${feeder.heartBeat0}`,
                                `scaler1: ${feeder.scaler1}`,
                                `aggregator1: ${await formatAddress(feeder.aggregator1, deps)}`,
                                `heartBeat1: ${feeder.heartBeat1}`,
                            ];
                            return `{ instrument: ${await formatAddress(instrument, deps)}, ${payload.join(', ')} }`;
                        })
                    );
                    return `setFeeder(entries: [${entries.join(', ')}])`;
                }
                default:
                    return `${functionName}(${stringify(args)})`;
            }
        },

        async parseEvent(event) {
            const { eventName, args } = event as { eventName: string; args: Record<string, any> };
            switch (eventName) {
                case 'SetFeeder': {
                    const { instrument, feeder } = args as {
                        instrument: Address;
                        feeder: {
                            ftype: number;
                            scaler0: bigint;
                            aggregator0: Address;
                            heartBeat0: number;
                            scaler1: bigint;
                            aggregator1: Address;
                            heartBeat1: number;
                        };
                    };
                    const payload = [
                        `ftype: ${formatFeederType(feeder.ftype)}`,
                        `scaler0: ${feeder.scaler0}`,
                        `aggregator0: ${await formatAddress(feeder.aggregator0, deps)}`,
                        `heartBeat0: ${feeder.heartBeat0}`,
                        `scaler1: ${feeder.scaler1}`,
                        `aggregator1: ${await formatAddress(feeder.aggregator1, deps)}`,
                        `heartBeat1: ${feeder.heartBeat1}`,
                    ];
                    return `SetFeeder(instrument: ${await formatAddress(instrument, deps)}, ${payload.join(', ')})`;
                }
                case 'UpdateAccState': {
                    const { instrument, expiry, state } = args as {
                        instrument: Address;
                        expiry: number;
                        state: { time: number; spot: bigint; initTime: number; initMark: bigint; accumulation: bigint };
                    };
                    const payload = [
                        `time: ${formatTimestamp(state.time)}`,
                        `spot: ${formatWad(state.spot)}`,
                        `initTime: ${formatTimestamp(state.initTime)}`,
                        `initMark: ${formatWad(state.initMark)}`,
                        `accumulation: ${formatWad(state.accumulation)}`,
                    ];
                    return `UpdateAccState(instrument: ${await formatAddress(instrument, deps)}, expiry: ${formatExpiry(
                        Number(expiry)
                    )}, ${payload.join(', ')})`;
                }
                default:
                    return `${eventName}(...)`;
            }
        },

        async parseError(error) {
            if (typeof error === 'string') {
                return error;
            }
            if (error.name) return error.name;
            if (error.signature) return error.signature;
            return 'CexMarket error';
        },
    };
}
