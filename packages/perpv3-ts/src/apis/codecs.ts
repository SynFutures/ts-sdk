import { isAddress, type Address } from 'viem';

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, label: string): UnknownRecord {
    if (isRecord(value)) {
        return value;
    }
    throw new Error(`Invalid ${label}: expected object`);
}

export function requireArray(value: unknown, label: string): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }
    throw new Error(`Invalid ${label}: expected array`);
}

/** Reads a backend list field, where Go serializes an empty (nil) slice as `null`. */
export function requireNullableArray(value: unknown, label: string): unknown[] {
    return value === null ? [] : requireArray(value, label);
}

export function requireString(record: UnknownRecord, key: string, label = key): string {
    return requireStringValue(record[key], label);
}

export function requireStringValue(value: unknown, label: string): string {
    if (typeof value === 'string') {
        return value;
    }
    throw new Error(`Invalid ${label}: expected string`);
}

export function requireAddress(record: UnknownRecord, key: string, label = key): Address {
    const value = requireString(record, key, label);
    // Backend payloads are not guaranteed to use EIP-55 casing, so only the address format is checked.
    if (isAddress(value, { strict: false })) {
        return value;
    }
    throw new Error(`Invalid ${label}: expected address`);
}

export function optionalAddress(record: UnknownRecord, key: string, label = key): Address | undefined {
    if (record[key] === undefined) {
        return undefined;
    }
    return requireAddress(record, key, label);
}

export function requireNumber(record: UnknownRecord, key: string, label = key): number {
    return requireNumberValue(record[key], label);
}

export function requireNumberValue(value: unknown, label: string): number {
    const parsed = parseOptionalNumber(value);
    if (parsed !== undefined) {
        return parsed;
    }
    throw new Error(`Invalid ${label}: expected number`);
}

/** Reads a finite number or a non-blank numeric string; anything else, including `''`, yields undefined. */
export function parseOptionalNumber(value: unknown): number | undefined {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
}

export function requireBoolean(record: UnknownRecord, key: string, label = key): boolean {
    const value = record[key];
    if (typeof value === 'boolean') {
        return value;
    }
    throw new Error(`Invalid ${label}: expected boolean`);
}

export function requireBigInt(record: UnknownRecord, key: string, label = key): bigint {
    return toBigIntValue(record[key], label);
}

/**
 * JSON.parse that keeps integers beyond Number.MAX_SAFE_INTEGER as their exact source text, which
 * `toBigIntValue` accepts. Needs a runtime with JSON.parse source text access (Node.js 22+); elsewhere such
 * numbers stay lossy and `toBigIntValue` rejects them.
 */
export function parseJsonPreservingLargeIntegers(text: string): unknown {
    return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) =>
        typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)
            ? (context?.source ?? value)
            : value
    );
}

/**
 * Converts an API integer to bigint without losing precision. Accepts bigint, safe-integer numbers and
 * integer strings, including exponent forms such as `1e18` whose value is a whole number.
 */
export function toBigIntValue(value: unknown, label = 'bigint'): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
        if (Number.isSafeInteger(value)) return BigInt(value);
        throw new Error(`Invalid ${label}: expected safe integer`);
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
        throw new Error(`Invalid ${label}: expected integer string`);
    }
    const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value.trim());
    if (!match) throw new Error(`Invalid ${label}: expected integer string`);
    const [, sign, whole, fraction = '', power = '0'] = match;
    const shift = Number(power) - fraction.length;
    if (!Number.isSafeInteger(shift) || Math.abs(shift) > 1000)
        throw new Error(`Invalid ${label}: exponent out of range`);
    let digits = whole + fraction;
    if (shift < 0) {
        const retained = digits.length + shift;
        if (/[1-9]/.test(digits.slice(Math.max(0, retained)))) throw new Error(`Invalid ${label}: fractional value`);
        digits = retained > 0 ? digits.slice(0, retained) : '0';
    } else {
        digits += '0'.repeat(shift);
    }
    return BigInt(`${sign}${digits}`);
}

/** Accepts only declared members of a numeric enum; unknown backend values fail instead of being coerced. */
export function requireEnumMember<T extends number>(
    enumObject: Record<string, string | number>,
    value: number,
    label: string
): T {
    // Numeric enums map each member value back to its name.
    if (typeof enumObject[value] === 'string') {
        return value as T;
    }
    throw new Error(`Invalid ${label}: unsupported value ${value}`);
}

export function optionalString(record: UnknownRecord, key: string, label = key): string | undefined {
    if (record[key] === undefined) {
        return undefined;
    }
    return requireString(record, key, label);
}

export function optionalNumber(record: UnknownRecord, key: string, label = key): number | undefined {
    if (record[key] === undefined) {
        return undefined;
    }
    return requireNumber(record, key, label);
}
