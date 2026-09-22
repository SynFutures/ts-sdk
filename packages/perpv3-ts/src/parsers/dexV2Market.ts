import type { Address, ContractParser } from '@derivation-tech/viem-kit';
import { formatAddress, formatExpiry, formatTimestamp, formatWad } from '../utils/format';
import { formatFeederType } from './enums';
import type { ParserDeps } from './types';
import { defaultParseError } from './errors';
import { DEX_V2_MARKET_ABI } from '../abis';

function stringify(values: readonly unknown[]): string {
    return values.map((value) => String(value)).join(', ');
}

type EventArgsBag = {
    [name: string]: unknown;
};

export function createDexV2MarketParser(deps?: ParserDeps): ContractParser<typeof DEX_V2_MARKET_ABI> {
    return {
        abi: DEX_V2_MARKET_ABI,

        async parseTransaction({ functionName, args }) {
            switch (functionName) {
                case 'addDexV2Factory': {
                    const [factory] = args as readonly [Address];
                    return `addDexV2Factory(factory: ${await formatAddress(factory, deps)})`;
                }
                case 'clearStates': {
                    const [expiry] = args as readonly [number | bigint];
                    return `clearStates(expiry: ${formatExpiry(Number(expiry))})`;
                }
                case 'initialize': {
                    const [factories] = args as readonly [Address[]];
                    const list = await Promise.all(factories.map((address) => formatAddress(address, deps)));
                    return `initialize(factories: [${list.join(', ')}])`;
                }
                case 'updateFeeder': {
                    const [instrument] = args as readonly [Address];
                    return `updateFeeder(instrument: ${await formatAddress(instrument, deps)})`;
                }
                default:
                    return `${functionName}(${stringify(args)})`;
            }
        },

        async parseEvent(event) {
            const eventName: string = event.eventName;
            const args = event.args as EventArgsBag;
            switch (eventName) {
                case 'AddDexV2Factory': {
                    const { factory, number } = args as { factory: Address; number: bigint };
                    return `AddDexV2Factory(factory: ${await formatAddress(factory, deps)}, number: ${number})`;
                }
                case 'SetFeeder': {
                    const { instrument, feeder } = args as {
                        instrument: Address;
                        feeder: {
                            ftype: number;
                            isToken0Quote: boolean;
                            pair: Address;
                            scaler0: bigint;
                            scaler1: bigint;
                        };
                    };
                    const payload = [
                        `ftype: ${formatFeederType(feeder.ftype)}`,
                        `isToken0Quote: ${feeder.isToken0Quote}`,
                        `pair: ${await formatAddress(feeder.pair, deps)}`,
                        `scaler0: ${feeder.scaler0}`,
                        `scaler1: ${feeder.scaler1}`,
                    ];
                    return `SetFeeder(instrument: ${await formatAddress(instrument, deps)}, ${payload.join(', ')})`;
                }
                case 'UpdateAccState': {
                    const { instrument, expiry, accState } = args as {
                        instrument: Address;
                        expiry: number;
                        accState: { initTime: number; initMark: bigint; initAccumulation: bigint };
                    };
                    const payload = [
                        `initTime: ${formatTimestamp(accState.initTime)}`,
                        `initMark: ${formatWad(accState.initMark)}`,
                        `initAccumulation: ${formatWad(accState.initAccumulation)}`,
                    ];
                    return `UpdateAccState(instrument: ${await formatAddress(instrument, deps)}, expiry: ${formatExpiry(
                        Number(expiry)
                    )}, ${payload.join(', ')})`;
                }
                case 'Initialized': {
                    const { version } = args as { version: number };
                    return `Initialized(version: ${version})`;
                }
                default:
                    return `${eventName}(...)`;
            }
        },

        async parseError(error) {
            return defaultParseError(error, 'DexV2Market error');
        },
    };
}
