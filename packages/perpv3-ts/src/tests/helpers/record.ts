export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord {
    return isRecord(value) ? value : {};
}

export function recordEntries(value: unknown): Array<[string, unknown]> {
    return isRecord(value) ? Object.entries(value) : [];
}
