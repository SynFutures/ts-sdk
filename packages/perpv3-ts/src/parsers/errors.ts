import type { DecodedContractError, ErrorParserMap } from '@derivation-tech/viem-kit';

export function defaultParseError(error: DecodedContractError, fallback: string): string {
    switch (error.kind) {
        case 'custom':
            return error.name;
        case 'revertString':
            return error.reason;
        case 'panic':
            return error.code === undefined ? error.message : `Panic(${error.code})`;
        case 'raw':
        case 'unknown':
            return error.message || fallback;
    }
}

export async function parseCustomError(
    error: DecodedContractError,
    parsers: ErrorParserMap,
    fallback: string
): Promise<string> {
    if (error.kind !== 'custom') {
        return defaultParseError(error, fallback);
    }

    const parser = parsers[error.name];
    if (parser) {
        const parsed = await parser(error.args, error);
        return parsed ?? error.name;
    }

    return error.name;
}
