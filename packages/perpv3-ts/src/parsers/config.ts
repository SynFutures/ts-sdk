import type { Address, ContractParser } from '@derivation-tech/viem-kit';
import { formatAddress, formatRatio, formatTokenAmount } from '../utils/format';
import { formatQuoteType } from './enums';
import type { ParserDeps } from './types';
import { CURRENT_CONFIG_ABI } from '../abis';

interface QuoteParamTuple {
    minMarginAmount: bigint;
    tradingFeeRatio: number;
    protocolFeeRatio: number;
    qtype: number;
    tip: bigint;
}

function stringify(values: readonly unknown[]): string {
    return values.map((value) => String(value)).join(', ');
}

export function createConfigParser(deps?: ParserDeps): ContractParser {
    return {
        abi: CURRENT_CONFIG_ABI,

        async parseTransaction({ functionName, args }) {
            switch (functionName) {
                case 'setQuoteParam': {
                    const [coins, params] = args as readonly [Address[], QuoteParamTuple[]];
                    const formatted = await Promise.all(
                        coins.map(async (coin, index) => {
                            const param = params[index];
                            const payload = [
                                `minMarginAmount: ${await formatTokenAmount(param.minMarginAmount, coin, deps)}`,
                                `tradingFeeRatio: ${formatRatio(param.tradingFeeRatio)}`,
                                `protocolFeeRatio: ${formatRatio(param.protocolFeeRatio)}`,
                                `qtype: ${formatQuoteType(param.qtype)}`,
                                `tip: ${await formatTokenAmount(param.tip, coin, deps)}`,
                            ];
                            return `{ quote: ${await formatAddress(coin, deps)}, ${payload.join(', ')} }`;
                        })
                    );
                    return `setQuoteParam(params: [${formatted.join(', ')}])`;
                }
                case 'enableLpWhitelistForQuote': {
                    const [quote, enable] = args as readonly [Address, boolean];
                    return `enableLpWhitelistForQuote(quote: ${await formatAddress(quote, deps)}, enable: ${enable})`;
                }
                case 'setLiquidatorWhitelist': {
                    const [users, flags] = args as readonly [Address[], boolean[]];
                    const entries = await Promise.all(
                        users.map(async (user, idx) => {
                            return `{ user: ${await formatAddress(user, deps)}, authorized: ${flags[idx]} }`;
                        })
                    );
                    return `setLiquidatorWhitelist(entries: [${entries.join(', ')}])`;
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
                case 'setMarketInfo': {
                    const [mtype, market, beacon] = args as readonly [string, Address, Address];
                    return `setMarketInfo(mtype: ${mtype}, market: ${await formatAddress(
                        market,
                        deps
                    )}, beacon: ${await formatAddress(beacon, deps)})`;
                }
                case 'disableLiquidatorWhitelist': {
                    return 'disableLiquidatorWhitelist()';
                }
                case 'transferOwnership': {
                    const [newOwner] = args as readonly [Address];
                    return `transferOwnership(newOwner: ${await formatAddress(newOwner, deps)})`;
                }
                case 'renounceOwnership': {
                    return 'renounceOwnership()';
                }
                default:
                    return `${functionName}(${stringify(args)})`;
            }
        },

        async parseEvent(event) {
            const { eventName, args } = event as { eventName: string; args: Record<string, any> };
            switch (eventName) {
                case 'SetQuoteParam': {
                    const { quote, param } = args as {
                        quote: Address;
                        param: {
                            minMarginAmount: bigint;
                            tradingFeeRatio: number;
                            protocolFeeRatio: number;
                            qtype: number;
                            tip: bigint;
                        };
                    };
                    const payload = [
                        `minMarginAmount: ${await formatTokenAmount(param.minMarginAmount, quote, deps)}`,
                        `tradingFeeRatio: ${formatRatio(param.tradingFeeRatio)}`,
                        `protocolFeeRatio: ${formatRatio(param.protocolFeeRatio)}`,
                        `qtype: ${formatQuoteType(param.qtype)}`,
                        `tip: ${await formatTokenAmount(param.tip, quote, deps)}`,
                    ];
                    return `SetQuoteParam(quote: ${await formatAddress(quote, deps)}, ${payload.join(', ')})`;
                }
                case 'SetLiquidatorWhitelist': {
                    const { user, authorized } = args as { user: Address; authorized: boolean };
                    return `SetLiquidatorWhitelist(user: ${await formatAddress(user, deps)}, authorized: ${authorized})`;
                }
                case 'SetLpWhitelistForQuote': {
                    const { quote, user, authorized } = args as { quote: Address; user: Address; authorized: boolean };
                    return `SetLpWhitelistForQuote(quote: ${await formatAddress(
                        quote,
                        deps
                    )}, user: ${await formatAddress(user, deps)}, authorized: ${authorized})`;
                }
                case 'DisableLiquidatorWhitelist': {
                    return 'DisableLiquidatorWhitelist()';
                }
                case 'EnableLpWhitelistForQuote': {
                    const { quote, restricted } = args as { quote: Address; restricted: boolean };
                    return `EnableLpWhitelistForQuote(quote: ${await formatAddress(quote, deps)}, restricted: ${restricted})`;
                }
                case 'OwnershipTransferred': {
                    const { previousOwner, newOwner } = args as { previousOwner: Address; newOwner: Address };
                    return `OwnershipTransferred(previousOwner: ${await formatAddress(
                        previousOwner,
                        deps
                    )}, newOwner: ${await formatAddress(newOwner, deps)})`;
                }
                case 'SetMarketInfo': {
                    const { mtype, market, beacon } = args as {
                        mtype: string;
                        market: Address;
                        beacon: Address;
                    };
                    return `SetMarketInfo(mtype: ${mtype}, market: ${await formatAddress(
                        market,
                        deps
                    )}, beacon: ${await formatAddress(beacon, deps)})`;
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
            if (error.name) return error.name;
            if (error.signature) return error.signature;
            return 'Config error';
        },
    };
}
