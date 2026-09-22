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
    if (isAddress(value)) {
        return value;
    }
    throw new Error(`Invalid ${label}: expected address`);
}

export function requireNumber(record: UnknownRecord, key: string, label = key): number {
    return requireNumberValue(record[key], label);
}

export function requireNumberValue(value: unknown, label: string): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    throw new Error(`Invalid ${label}: expected number`);
}

export function requireBoolean(record: UnknownRecord, key: string, label = key): boolean {
    const value = record[key];
    if (typeof value === 'boolean') {
        return value;
    }
    throw new Error(`Invalid ${label}: expected boolean`);
}

export function requireBigInt(record: UnknownRecord, key: string, label?: string): bigint {
    const value = record[key];
    if (typeof value === 'bigint') {
        return value;
    }
    if (label === undefined) {
        throw new Error(`Missing required bigint field "${key}"`);
    }
    throw new Error(`Invalid ${label}: expected bigint`);
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
