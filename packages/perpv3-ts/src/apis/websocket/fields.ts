export type FieldResult<T> = { ok: true; value: T } | { ok: false };
export type OptionalFieldResult<T> = { ok: true; value?: T } | { ok: false };

export function readRequiredField<T>(
    record: Record<string, unknown>,
    key: string,
    normalize: (value: unknown) => T | undefined
): FieldResult<T> {
    const value = normalize(record[key]);
    return value === undefined ? { ok: false } : { ok: true, value };
}

export function readOptionalField<T>(
    record: Record<string, unknown>,
    key: string,
    normalize: (value: unknown) => T | undefined
): OptionalFieldResult<T> {
    if (!(key in record) || record[key] === undefined) return { ok: true };
    const value = normalize(record[key]);
    return value === undefined ? { ok: false } : { ok: true, value };
}
