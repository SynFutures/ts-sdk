import { expect } from '@jest/globals';
import { isRecord, recordEntries } from '../../helpers/record';

export function compareTradeResults(apiResult: unknown, rpcResult: unknown): void {
    const alignedRpc = pickStructure(rpcResult, apiResult);
    const apiNormalized = normalizeData(apiResult);
    const rpcNormalized = normalizeData(alignedRpc);

    // Funding index can legitimately differ when API and RPC snapshots come from different source timings.
    if (hasPostPosition(apiNormalized) && hasPostPosition(rpcNormalized)) {
        rpcNormalized.postPosition = {
            ...rpcNormalized.postPosition,
            entryFundingIndex: apiNormalized.postPosition.entryFundingIndex,
        };
    }

    if (process.env.DEBUG_PARITY_TEST) {
        console.log('[DEBUG] API Result:', JSON.stringify(apiNormalized, null, 2));
        console.log('[DEBUG] RPC Result (aligned):', JSON.stringify(rpcNormalized, null, 2));
    }

    expect(rpcNormalized).toEqual(apiNormalized);
}

export function normalizeData(value: unknown): unknown {
    return normalizeInternal(value);
}

function pickStructure(source: unknown, template: unknown, path = 'root'): unknown {
    if (template === null || typeof template !== 'object') {
        return source;
    }

    if (Array.isArray(template)) {
        if (!Array.isArray(source)) {
            throw new Error(`Type mismatch at ${path}: expected array, got ${typeof source}`);
        }
        if (source.length !== template.length) {
            throw new Error(`Array length mismatch at ${path}: API has ${template.length}, RPC has ${source.length}`);
        }
        return template.map((_, index) => pickStructure(source[index], template[index], `${path}[${index}]`));
    }

    if (!isRecord(source) || !isRecord(template)) {
        throw new Error(`Type mismatch at ${path}: expected object, got ${typeof source}`);
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(template)) {
        if (!(key in source)) {
            throw new Error(`RPC result missing field at ${path}.${key}`);
        }
        result[key] = pickStructure(source[key], template[key], `${path}.${key}`);
    }
    return result;
}

type ResultWithPostPosition = { postPosition: { entryFundingIndex: unknown } };

function hasPostPosition(value: unknown): value is ResultWithPostPosition {
    if (!isRecord(value) || !isRecord(value.postPosition)) {
        return false;
    }
    return 'entryFundingIndex' in value.postPosition;
}

function normalizeInternal(value: unknown): unknown {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeInternal(item));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(recordEntries(value).map(([key, v]) => [key, normalizeInternal(v)]));
    }
    return value;
}
