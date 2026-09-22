type UnknownRecord = {
    [key: string]: unknown;
};

const INTEGER_STRING_REGEX = /^[+-]?\d+$/;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidBigIntValue(key: string, value: unknown): Error {
    return new Error(`Invalid bigint value for key "${key}": ${String(value)}`);
}

function parseBigIntField(value: unknown, key: string): bigint {
    if (value === null || value === undefined) {
        throw invalidBigIntValue(key, value);
    }
    if (typeof value === 'bigint') {
        return value;
    }
    if (typeof value === 'number') {
        if (Number.isSafeInteger(value)) {
            return BigInt(value);
        }
        throw invalidBigIntValue(key, value);
    }
    if (typeof value === 'string') {
        const normalized = value.trim();
        if (!normalized) {
            throw invalidBigIntValue(key, value);
        }
        if (INTEGER_STRING_REGEX.test(normalized)) {
            return BigInt(normalized);
        }
    }
    throw invalidBigIntValue(key, value);
}

function normalizeBigIntFieldsValue(value: unknown, bigIntKeys: ReadonlySet<string>): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeBigIntFieldsValue(item, bigIntKeys));
    }
    if (!isRecord(value)) {
        return value;
    }

    const normalized: UnknownRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        normalized[key] = bigIntKeys.has(key)
            ? parseBigIntField(entry, key)
            : normalizeBigIntFieldsValue(entry, bigIntKeys);
    }
    return normalized;
}

/**
 * Recursively converts specified keys in an object to bigint.
 * Empty, missing, unsafe, or malformed values fail fast.
 */
export function normalizeBigIntFields<T>(obj: T, bigIntKeys?: readonly string[]): T {
    if (!bigIntKeys || bigIntKeys.length === 0) {
        return obj;
    }
    return normalizeBigIntFieldsValue(obj, new Set(bigIntKeys)) as T;
}
