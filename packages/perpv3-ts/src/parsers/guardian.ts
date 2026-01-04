import type { Address, ContractParser } from '@derivation-tech/viem-kit';
import { formatAddress, formatExpiry, formatRatio, formatTokenAmount } from '../utils/format';
import { formatFeederType, formatQuoteType } from './enums';
import type { ParserDeps } from './types';
import { CURRENT_GUARDIAN_ABI } from '../abis';

interface CexPriceFeederTuple {
    ftype: number;
    scaler0: bigint;
    aggregator0: Address;
    heartBeat0: number;
    scaler1: bigint;
    aggregator1: Address;
    heartBeat1: number;
}

function stringify(values: readonly unknown[]): string {
    return values.map((value) => String(value)).join(', ');
}

async function formatQuoteParamEntries(
    identities: Address[],
    params: Array<{
        minMarginAmount: bigint;
        tradingFeeRatio: number;
        protocolFeeRatio: number;
        qtype: number;
        tip: bigint;
    }>,
    deps?: ParserDeps
): Promise<string[]> {
    return Promise.all(
        identities.map(async (identity, idx) => {
            const param = params[idx];
            const payload = [
                `minMarginAmount: ${await formatTokenAmount(param.minMarginAmount, identity, deps)}`,
                `tradingFeeRatio: ${formatRatio(param.tradingFeeRatio)}`,
                `protocolFeeRatio: ${formatRatio(param.protocolFeeRatio)}`,
                `qtype: ${formatQuoteType(param.qtype)}`,
                `tip: ${await formatTokenAmount(param.tip, identity, deps)}`,
            ];
            return `{ target: ${await formatAddress(identity, deps)}, ${payload.join(', ')} }`;
        })
    );
}

async function formatBoolEntries(
    name: string,
    addresses: Address[],
    flags: boolean[],
    deps?: ParserDeps
): Promise<string> {
    const entries = await Promise.all(
        addresses.map(async (address, idx) => {
            return `{ ${name}: ${await formatAddress(address, deps)}, value: ${flags[idx]} }`;
        })
    );
    return `[${entries.join(', ')}]`;
}

export function createGuardianParser(deps?: ParserDeps): ContractParser {
    return {
        abi: CURRENT_GUARDIAN_ABI,

        async parseTransaction({ functionName, args }) {
            switch (functionName) {
                case 'claimProtocolFee':
                case 'recycleInsuranceFund': {
                    const [instruments, expiries] = args as readonly [Address[], Array<number | bigint>];
                    const instrumentList = await Promise.all(
                        instruments.map((instrument) => formatAddress(instrument, deps))
                    );
                    const formattedExpiries = expiries.map((expiry) => formatExpiry(Number(expiry)));
                    return `${functionName}(instruments: [${instrumentList.join(
                        ', '
                    )}], expiries: [${formattedExpiries.join(', ')}])`;
                }
                case 'setConfigQuoteParam':
                case 'setInstrumentQuoteParam': {
                    const [targets, params] = args as readonly [Address[], Array<any>];
                    const entries = await formatQuoteParamEntries(targets, params, deps);
                    return `${functionName}(entries: [${entries.join(', ')}])`;
                }
                case 'setLiquidatorWhitelist': {
                    const [users, flags] = args as readonly [Address[], boolean[]];
                    return `setLiquidatorWhitelist(entries: ${await formatBoolEntries('user', users, flags, deps)})`;
                }
                case 'setLpWhiteList': {
                    const [quotes, users, flags] = args as readonly [Address[], Address[], boolean[]];
                    const entries = await Promise.all(
                        quotes.map(async (quote, idx) => {
                            return `{ quote: ${await formatAddress(quote, deps)}, user: ${await formatAddress(
                                users[idx],
                                deps
                            )}, authorized: ${flags[idx]} }`;
                        })
                    );
                    return `setLpWhiteList(entries: [${entries.join(', ')}])`;
                }
                case 'setDisableOrderRebate': {
                    const [instruments, flags] = args as readonly [Address[], boolean[]];
                    const entries = await Promise.all(
                        instruments.map(async (instrument, idx) => {
                            return `{ instrument: ${await formatAddress(instrument, deps)}, disable: ${flags[idx]} }`;
                        })
                    );
                    return `setDisableOrderRebate(entries: [${entries.join(', ')}])`;
                }
                case 'setFundingHour': {
                    const [instruments, hours] = args as readonly [Address[], number[]];
                    const entries = await Promise.all(
                        instruments.map(async (instrument, idx) => {
                            return `{ instrument: ${await formatAddress(instrument, deps)}, hour: ${hours[idx]} }`;
                        })
                    );
                    return `setFundingHour(entries: [${entries.join(', ')}])`;
                }
                case 'setInstrumentLeverage': {
                    const [instruments, imr, mmr] = args as readonly [Address[], number[], number[]];
                    const entries = await Promise.all(
                        instruments.map(async (instrument, idx) => {
                            return `{ instrument: ${await formatAddress(instrument, deps)}, initialMarginRatio: ${formatRatio(
                                imr[idx]
                            )}, maintenanceMarginRatio: ${formatRatio(mmr[idx])} }`;
                        })
                    );
                    return `setInstrumentLeverage(entries: [${entries.join(', ')}])`;
                }
                case 'setPlacePaused': {
                    const [instruments, flags] = args as readonly [Address[], boolean[]];
                    const entries = await Promise.all(
                        instruments.map(async (instrument, idx) => {
                            return `{ instrument: ${await formatAddress(instrument, deps)}, paused: ${flags[idx]} }`;
                        })
                    );
                    return `setPlacePaused(entries: [${entries.join(', ')}])`;
                }
                case 'setThreshold': {
                    const [quotes, thresholds] = args as readonly [Address[], Array<bigint | number>];
                    const entries = await Promise.all(
                        quotes.map(async (quote, idx) => {
                            return `{ quote: ${await formatAddress(quote, deps)}, threshold: ${await formatTokenAmount(
                                thresholds[idx],
                                quote,
                                deps
                            )} }`;
                        })
                    );
                    return `setThreshold(entries: [${entries.join(', ')}])`;
                }
                case 'setBlacklist': {
                    const [users, banned] = args as readonly [Address[], boolean[]];
                    const entries = await Promise.all(
                        users.map(async (user, idx) => {
                            return `{ user: ${await formatAddress(user, deps)}, banned: ${banned[idx]} }`;
                        })
                    );
                    return `setBlacklist(entries: [${entries.join(', ')}])`;
                }
                case 'setCexMarketPriceFeeder': {
                    const [mtype, instruments, feeders] = args as readonly [string, Address[], CexPriceFeederTuple[]];
                    const entries = await Promise.all(
                        instruments.map(async (instrument, idx) => {
                            const feeder = feeders[idx];
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
                    return `setCexMarketPriceFeeder(mtype: ${mtype}, entries: [${entries.join(', ')}])`;
                }
                case 'setConfigAndGateAddress': {
                    const [config, gate] = args as readonly [Address, Address];
                    return `setConfigAndGateAddress(config: ${await formatAddress(
                        config,
                        deps
                    )}, gate: ${await formatAddress(gate, deps)})`;
                }
                case 'setEmergingFeederFactoryAddress':
                case 'setPythFeederFactoryAddress':
                case 'setSynFuturesV3Admin':
                case 'setToAddress': {
                    const [address] = args as readonly [Address];
                    return `${functionName}(${await formatAddress(address, deps)})`;
                }
                case 'setPendingDuration': {
                    const [duration] = args as readonly [bigint | number];
                    const seconds = Number(duration);
                    const hours = (seconds / 3600).toFixed(2);
                    return `setPendingDuration(duration: ${seconds}s / ${hours}h)`;
                }
                case 'withdrawFromGate': {
                    const [tokens, amounts] = args as readonly [Address[], Array<bigint | number>];
                    const entries = await Promise.all(
                        tokens.map(async (token, idx) => {
                            return `{ token: ${await formatAddress(token, deps)}, amount: ${await formatTokenAmount(
                                amounts[idx],
                                token,
                                deps
                            )} }`;
                        })
                    );
                    return `withdrawFromGate(entries: [${entries.join(', ')}])`;
                }
                case 'withdrawFromGuardian': {
                    const [tokens] = args as readonly [Address[]];
                    const entries = await Promise.all(tokens.map((token) => formatAddress(token, deps)));
                    return `withdrawFromGuardian(tokens: [${entries.join(', ')}])`;
                }
                case 'enableLpWhitelistForQuote': {
                    const [quote, enable] = args as readonly [Address, boolean];
                    return `enableLpWhitelistForQuote(quote: ${await formatAddress(quote, deps)}, enable: ${enable})`;
                }
                case 'disableLiquidatorWhitelist': {
                    return 'disableLiquidatorWhitelist()';
                }
                default:
                    return `${functionName}(${stringify(args)})`;
            }
        },

        async parseEvent(event) {
            const { eventName, args } = event as { eventName: string; args: Record<string, any> };
            switch (eventName) {
                case 'FreezeInstrumentFailed': {
                    const { instrument } = args as { instrument: Address; lowLevelData: string };
                    return `FreezeInstrumentFailed(instrument: ${await formatAddress(instrument, deps)})`;
                }
                case 'SetToAddress': {
                    const { to } = args as { to: Address };
                    return `SetToAddress(to: ${await formatAddress(to, deps)})`;
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
            return 'Guardian error';
        },
    };
}
