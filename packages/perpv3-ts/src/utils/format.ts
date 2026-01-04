import type { Address, Erc20TokenInfo } from '@derivation-tech/viem-kit';
import { formatUnits, getAddress, isAddress, Multicall } from '@derivation-tech/viem-kit';
import { formatInTimeZone } from 'date-fns-tz';
import { sqrtX96ToWad, tickToSqrtX96 } from '../math';
import { MAX_UINT_16, MAX_UINT_24, Q24 } from '../constants';
import type { ParserDeps } from '../parsers/types';
import { PERP_EXPIRY } from '../types';

// ============================================================================
// Exported Constants and Interfaces
// ============================================================================

export const DEFAULT_DECIMALS = 18;

export interface FormatContext {
    deps?: ParserDeps;
}

export interface EmaParamStruct {
    emaHalfTime: number;
    maxTimeDelta: number;
    maxRawTimeDelta: number;
    maxChangeRatioPerSecond: number;
}

// ============================================================================
// Exported Functions
// ============================================================================

export function toBigInt(value: bigint | number | string): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (value.startsWith('0x') || value.startsWith('0X')) {
        return BigInt(value);
    }
    return BigInt(value);
}

export function formatUnitsSafe(value: bigint | number | string, decimals: number, fixedDecimals = 6): string {
    const formatted = formatUnits(toBigInt(value), decimals);
    return shortenDecimals(formatted, fixedDecimals);
}

export function formatWad(value: bigint | number | string, fixedDecimals = 6): string {
    return formatUnitsSafe(value, DEFAULT_DECIMALS, fixedDecimals);
}

export function formatTimestamp(value: bigint | number | string): string {
    const seconds = Number(toBigInt(value));
    if (seconds <= 0) return seconds.toString();
    return new Date(seconds * 1000).toISOString();
}

export function formatExpiry(expiry: number): string {
    if (expiry === PERP_EXPIRY) return 'PERP';
    return formatInTimeZone(new Date(expiry * 1000), 'UTC', 'yyyyMMdd');
}

export function formatRatio(value: bigint | number | string, fixedDecimals = 2): string {
    const ratio = formatUnitsSafe(value, fixedDecimals, fixedDecimals);
    return `${ratio}%`;
}

export function formatSqrtPX96(value: bigint, fixedDecimals = 6): string {
    return formatWad(sqrtX96ToWad(value), fixedDecimals);
}

export function formatTick(tick: number, fixedDecimals = 6): string {
    const MIN_TICK = -887272;
    const MAX_TICK = 887272;
    if (tick < MIN_TICK) return 'MIN_TICK';
    if (tick > MAX_TICK) return 'MAX_TICK';
    const sqrtPrice = tickToSqrtX96(tick);
    return `${tick}(${formatSqrtPX96(sqrtPrice, fixedDecimals)})`;
}

export function decodeCompactEmaParam(data: bigint): EmaParamStruct {
    return {
        emaHalfTime: Number((data >> 48n) & 0xffffn),
        maxTimeDelta: Number((data >> 32n) & 0xffffn),
        maxRawTimeDelta: Number((data >> 16n) & 0xffffn),
        maxChangeRatioPerSecond: Number(data & 0xffffn),
    };
}

export function formatEmaParam(param: EmaParamStruct): string {
    return [
        `emaHalfTime: ${param.emaHalfTime}`,
        `maxTimeDelta: ${param.maxTimeDelta}`,
        `maxRawTimeDelta: ${param.maxRawTimeDelta}`,
        `maxChangeRatioPerSecond: ${formatRatio(param.maxChangeRatioPerSecond)}`,
    ].join(', ');
}

export function formatCompactEmaParam(data: bigint): string {
    return formatEmaParam(decodeCompactEmaParam(data));
}

export function extractFeeRatioParams(stabilityFeeRatioParam: bigint): bigint[] {
    const values: bigint[] = [];
    // Convert to WAD format with 16-decimal scaling (multiply by 10^16)
    // This is used for stability fee ratio parameters
    values.push(BigInt(stabilityFeeRatioParam & MAX_UINT_24) * 10n ** 16n);
    values.push(BigInt((stabilityFeeRatioParam >> 24n) & MAX_UINT_16) * 10n ** 16n);
    values.push(BigInt((stabilityFeeRatioParam >> 40n) & MAX_UINT_16) * 10n ** 16n);
    values.push(BigInt(stabilityFeeRatioParam >> 56n) * 10n ** 16n);
    return values;
}

export async function formatAddress(address: Address, deps?: ParserDeps): Promise<string> {
    if (deps?.resolveAddress) {
        const name = await deps.resolveAddress(address);
        if (name && name !== 'UNKNOWN' && name !== address) {
            return `[${name}]${address}`;
        }
    }
    return address;
}

export async function resolveTokenInfo(token: string, deps?: ParserDeps): Promise<Erc20TokenInfo | undefined> {
    if (!deps) return undefined;
    if (deps.getTokenInfo) {
        const info = await deps.getTokenInfo(token);
        if (info) return info;
    }
    if (deps.publicClient && isAddress(token)) {
        const checksum = getAddress(token as Address);
        try {
            const [fetched] = await Multicall.getErc20TokenInfos(deps.publicClient, [checksum]);
            if (fetched) {
                return {
                    address: checksum,
                    decimals: fetched.decimals,
                    symbol: fetched.symbol,
                    name: fetched.name,
                };
            }
        } catch {
            // ignore
        }
    }
    return undefined;
}

export async function formatTokenAmount(
    value: bigint | number | string,
    token: string | Address,
    deps?: ParserDeps,
    fixedDecimals = 6
): Promise<string> {
    const info = await resolveTokenInfo(token, deps);
    if (!info) {
        return `${formatUnitsSafe(value, DEFAULT_DECIMALS, fixedDecimals)} ${isAddress(token) ? token : String(token)}`;
    }
    return `${formatUnitsSafe(value, info.decimals, fixedDecimals)} ${info.symbol}`;
}

export function formatBoolean(value: boolean): string {
    return value ? 'true' : 'false';
}

export function formatLimitTicks(limitTicks: number, fixedDecimals = 6): string {
    // Constants for 24-bit signed integer handling (calculated from common constants)
    const INT24_MASK = Number(MAX_UINT_24); // 24-bit mask (2^24 - 1)
    const INT24_SIGN_BIT = Number(Q24 >> 1n); // 2^23, the sign bit position for 24-bit signed int
    const INT24_NEGATIVE_OFFSET = Number(Q24); // 2^24, used to convert unsigned to signed

    // For 48-bit limitTicks: upper 24 bits = lowerTick, lower 24 bits = upperTick
    const rawLower = Number((BigInt(limitTicks) >> 24n) & BigInt(INT24_MASK));
    const rawUpper = Number(BigInt(limitTicks) & BigInt(INT24_MASK));

    // Convert back to signed int24 (handle negative numbers)
    // If the value is >= INT24_SIGN_BIT, it's a negative number in two's complement
    const minTickLower = rawLower >= INT24_SIGN_BIT ? rawLower - INT24_NEGATIVE_OFFSET : rawLower;
    const maxTickUpper = rawUpper >= INT24_SIGN_BIT ? rawUpper - INT24_NEGATIVE_OFFSET : rawUpper;

    return `{ minTickLower: ${formatTick(minTickLower, fixedDecimals)}, maxTickUpper: ${formatTick(maxTickUpper, fixedDecimals)} }`;
}

export function formatObject(
    obj: Record<string, unknown>,
    formatter: (key: string, value: unknown) => string | Promise<string>
): Promise<string> | string {
    const entries = Object.entries(obj);
    const maybePromises = entries.map(([key, value]) => formatter(key, value));
    if (maybePromises.some((v) => v instanceof Promise)) {
        return Promise.all(maybePromises.map(async (item) => item)).then((values) => {
            return `{ ${values.join(', ')} }`;
        });
    }
    return `{ ${(maybePromises as string[]).join(', ')} }`;
}

export function formatArray(values: unknown[], formatter: (value: unknown) => string): string {
    return `[${values.map((value) => formatter(value)).join(', ')}]`;
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

function shortenDecimals(value: string, fixedDecimals = 6): string {
    if (!value.includes('.')) return value;
    const [_integer, fraction] = value.split('.');
    if (fraction.length <= fixedDecimals) return value;
    const trimmed = Number(value).toFixed(fixedDecimals);
    return trimmed;
}
