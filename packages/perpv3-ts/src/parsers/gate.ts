import type { Address, ContractParser, Hex } from '@derivation-tech/viem-kit';
import { decodeAbiParameters } from 'viem';
import { decodeAddParam, decodeParamForDepositAndWithdraw } from '../utils/decode';
import {
    formatAddress,
    formatExpiry,
    formatLimitTicks,
    formatTimestamp,
    formatTokenAmount,
    formatWad,
    formatUnitsSafe,
} from '../utils/format';
import type { ParserDeps } from './types';
import { CURRENT_GATE_ABI } from '../abis';

function stringify(values: readonly unknown[]): string {
    return values.map((value) => String(value)).join(', ');
}

function isNative(token: string, deps?: ParserDeps): boolean {
    if (!deps?.nativeTokenAddress) return false;
    return token.toLowerCase() === deps.nativeTokenAddress.toLowerCase();
}

async function formatDepositArg(arg: Hex, deps?: ParserDeps): Promise<string> {
    const { token, quantity } = decodeParamForDepositAndWithdraw(arg);
    if (isNative(token, deps)) {
        return `{ token: ${await formatAddress(token as Address, deps)}, quantity: ${formatUnitsSafe(quantity, 18)} NATIVE }`;
    }
    const amount = await formatTokenAmount(quantity, token, deps);
    return `{ token: ${await formatAddress(token as Address, deps)}, quantity: ${amount} }`;
}

async function formatLaunchData(_mtype: string, data: Hex, deps?: ParserDeps): Promise<string> {
    try {
        const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'address' }], data);
        if (decoded && decoded.length === 2) {
            const [baseSymbol, quote] = decoded as [string, Address];
            return `{ base: ${baseSymbol}, quote: ${await formatAddress(quote, deps)} }`;
        }
    } catch {
        // ignore and fallback
    }
    if (data.length === 66) {
        try {
            const [base, quote] = decodeAbiParameters([{ type: 'address' }, { type: 'address' }], data);
            return `{ base: ${await formatAddress(base as Address, deps)}, quote: ${await formatAddress(quote as Address, deps)} }`;
        } catch {
            // ignore
        }
    }
    return data;
}

function formatAddArgs(args: readonly [Hex, Hex]): string {
    const decoded = decodeAddParam(args as [string, string]);
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `limitTicks: ${formatLimitTicks(decoded.limitTicks)}`,
        `amount: ${formatWad(decoded.amount)}`,
        `tickDeltaLower: ${decoded.tickDeltaLower}`,
        `tickDeltaUpper: ${decoded.tickDeltaUpper}`,
        `deadline: ${formatTimestamp(decoded.deadline)}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

const gateErrorFormatters: Record<string, (args?: readonly unknown[]) => string> = {
    MarketTypeNotSupported() {
        return 'MarketTypeNotSupported';
    },
    NotInstrument() {
        return 'NotInstrument';
    },
    NoDirectDeposit() {
        return 'NoDirectDeposit';
    },
    InvalidMsgValue() {
        return 'InvalidMsgValue';
    },
    InsufficientReserve(args) {
        if (!args || args.length < 2) return 'InsufficientReserve';
        const [requested, reserve] = args as [bigint | number | string, bigint | number | string];
        return `InsufficientReserve(requested: ${formatWad(requested)}, reserve: ${formatWad(reserve)})`;
    },
    UnsafeToken(args) {
        if (!args || args.length === 0) return 'UnsafeToken';
        const [token] = args as [Address];
        return `UnsafeToken(token: ${token})`;
    },
    NewInstrumentFailed(args) {
        if (!args || args.length === 0) return 'NewInstrumentFailed';
        const [lowLevelData] = args as [Hex];
        return `NewInstrumentFailed(lowLevelData: ${lowLevelData})`;
    },
    InstrumentExists() {
        return 'InstrumentExists';
    },
    BlacklistedTrader() {
        return 'BlacklistedTrader';
    },
    BadInstrumentAddress(args) {
        if (!args || args.length < 2) return 'BadInstrumentAddress';
        const [expected, actual] = args as [Address, Address];
        return `BadInstrumentAddress(expected: ${expected}, actual: ${actual})`;
    },
    PendingDurationTooLong() {
        return 'PendingDurationTooLong';
    },
    PendingWithdrawNotMature() {
        return 'PendingWithdrawNotMature';
    },
    NotHandler() {
        return 'NotHandler';
    },
};

export function createGateParser(deps?: ParserDeps): ContractParser {
    return {
        abi: CURRENT_GATE_ABI,
        async parseTransaction({ functionName, args }) {
            switch (functionName) {
                case 'deposit': {
                    const [arg] = args as readonly [Hex];
                    return `deposit(arg: ${await formatDepositArg(arg, deps)})`;
                }
                case 'depositFor': {
                    const [trader, arg] = args as readonly [Address, Hex];
                    return `depositFor(trader: ${await formatAddress(trader, deps)}, arg: ${await formatDepositArg(arg, deps)})`;
                }
                case 'withdraw': {
                    const [arg] = args as readonly [Hex];
                    return `withdraw(arg: ${await formatDepositArg(arg, deps)})`;
                }
                case 'withdrawFor': {
                    const [trader, arg] = args as readonly [Address, Hex];
                    return `withdrawFor(trader: ${await formatAddress(trader, deps)}, arg: ${await formatDepositArg(arg, deps)})`;
                }
                case 'gather':
                case 'scatter': {
                    const [quote, trader, expiry, quantity] = args as readonly [Address, Address, number, bigint];
                    const amount = await formatTokenAmount(quantity, quote, deps);
                    return `${functionName}(quote: ${await formatAddress(quote, deps)}, trader: ${await formatAddress(
                        trader,
                        deps
                    )}, expiry: ${formatExpiry(Number(expiry))}, quantity: ${amount})`;
                }
                case 'setThreshold': {
                    const [quote, threshold] = args as readonly [Address, bigint];
                    const amount = await formatTokenAmount(threshold, quote, deps);
                    return `setThreshold(quote: ${await formatAddress(quote, deps)}, threshold: ${amount})`;
                }
                case 'setBlacklist': {
                    const [trader, banned] = args as readonly [Address, boolean];
                    return `setBlacklist(trader: ${await formatAddress(trader, deps)}, banned: ${banned})`;
                }
                case 'launch': {
                    const [mtype, instrument, data, addArgs] = args as readonly [
                        string,
                        Address,
                        Hex,
                        readonly [Hex, Hex],
                    ];
                    return `launch(mtype: ${mtype}, instrument: ${await formatAddress(
                        instrument,
                        deps
                    )}, data: ${await formatLaunchData(mtype, data, deps)}, addArgs: ${formatAddArgs(addArgs as [Hex, Hex])})`;
                }
                case 'release': {
                    const [quote, trader] = args as readonly [Address, Address];
                    return `release(quote: ${await formatAddress(quote, deps)}, trader: ${await formatAddress(trader, deps)})`;
                }
                case 'setPendingDuration': {
                    const [duration] = args as readonly [bigint];
                    return `setPendingDuration(duration: ${duration} seconds)`;
                }
                default:
                    return `${functionName}(${stringify(args)})`;
            }
        },

        async parseEvent(event) {
            const { eventName, args } = event as { eventName: string; args: Record<string, unknown> };
            switch (eventName) {
                case 'Deposit': {
                    const { quote, trader, quantity } = args as {
                        quote: Address;
                        trader: Address;
                        quantity: bigint;
                    };
                    return `Deposit(quote: ${await formatAddress(quote, deps)}, trader: ${await formatAddress(
                        trader,
                        deps
                    )}, quantity: ${await formatTokenAmount(quantity, quote, deps)})`;
                }
                case 'Withdraw': {
                    const { quote, trader, quantity } = args as {
                        quote: Address;
                        trader: Address;
                        quantity: bigint;
                    };
                    return `Withdraw(quote: ${await formatAddress(quote, deps)}, trader: ${await formatAddress(
                        trader,
                        deps
                    )}, quantity: ${await formatTokenAmount(quantity, quote, deps)})`;
                }
                case 'Gather':
                case 'Scatter': {
                    const { quote, trader, instrument, expiry, quantity } = args as {
                        quote: Address;
                        trader: Address;
                        instrument: Address;
                        expiry: number;
                        quantity: bigint;
                    };
                    return `${eventName}(quote: ${await formatAddress(quote, deps)}, trader: ${await formatAddress(
                        trader,
                        deps
                    )}, instrument: ${await formatAddress(instrument, deps)}, expiry: ${formatExpiry(
                        Number(expiry)
                    )}, quantity: ${await formatTokenAmount(quantity, quote, deps)})`;
                }
                case 'NewInstrument': {
                    const { index, instrument, base, quote, symbol, total } = args as {
                        index: string;
                        instrument: Address;
                        base: Address;
                        quote: Address;
                        symbol: string;
                        total: bigint;
                    };
                    return `NewInstrument(index: ${index}, instrument: ${await formatAddress(
                        instrument,
                        deps
                    )}, base: ${await formatAddress(base, deps)}, quote: ${await formatAddress(
                        quote,
                        deps
                    )}, symbol: ${symbol}, total: ${total})`;
                }
                case 'Blacklist': {
                    const { trader, banned } = args as {
                        trader: Address;
                        banned: boolean;
                    };
                    return `Blacklist(trader: ${await formatAddress(trader, deps)}, banned: ${banned})`;
                }
                case 'SetPendingDuration': {
                    const { duration } = args as {
                        duration: bigint;
                    };
                    return `SetPendingDuration(duration: ${duration} seconds)`;
                }
                case 'SetThreshold': {
                    const { quote, threshold } = args as {
                        quote: Address;
                        threshold: bigint;
                    };
                    return `SetThreshold(quote: ${await formatAddress(quote, deps)}, threshold: ${await formatTokenAmount(
                        threshold,
                        quote,
                        deps
                    )})`;
                }
                case 'UpdatePending': {
                    const { quote, trader, pending } = args as {
                        quote: Address;
                        trader: Address;
                        pending: {
                            timestamp: number;
                            native: boolean;
                            amount: bigint;
                            exemption: bigint;
                        };
                    };
                    const pendingStr = [
                        `timestamp: ${formatTimestamp(pending.timestamp)}`,
                        `native: ${pending.native}`,
                        `amount: ${await formatTokenAmount(pending.amount, quote, deps)}`,
                        `exemption: ${await formatTokenAmount(pending.exemption, quote, deps)}`,
                    ].join(', ');
                    return `UpdatePending(quote: ${await formatAddress(quote, deps)}, trader: ${await formatAddress(
                        trader,
                        deps
                    )}, pending: { ${pendingStr} })`;
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
            if (typeof error === 'string') {
                return error;
            }
            if (error.name) {
                const formatter = gateErrorFormatters[error.name];
                if (formatter) {
                    try {
                        return formatter(error.args as readonly unknown[] | undefined);
                    } catch {
                        return formatter();
                    }
                }
            }
            if (error.name) return error.name;
            if (error.signature) return error.signature;
            return 'Gate error';
        },
    };
}
