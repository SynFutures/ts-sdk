export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface APIHeaders {
    'X-ACCESS-KEY': string;
    'X-ACCESS-SIGN': string;
    'X-ACCESS-TIMESTAMP': string;
    'X-ACCESS-PASSPHRASE': string;
    'Content-Type'?: string;
}

type SubtleCryptoLike = {
    importKey: (
        format: 'raw',
        keyData: ArrayBufferView,
        algorithm: { name: 'HMAC'; hash: { name: 'SHA-256' } },
        extractable: boolean,
        keyUsages: Array<'sign'>
    ) => Promise<unknown>;
    sign: (algorithm: { name: 'HMAC' }, key: unknown, data: ArrayBufferView) => Promise<ArrayBuffer>;
};

function getSubtleCrypto(): SubtleCryptoLike {
    const cryptoObj = (globalThis as unknown as { crypto?: { subtle?: unknown } }).crypto;
    const subtle = cryptoObj?.subtle as SubtleCryptoLike | undefined;
    if (!subtle) {
        throw new Error(
            'WebCrypto is not available. Request signing requires `globalThis.crypto.subtle` (supported in modern browsers and Node.js 18+).'
        );
    }
    return subtle;
}

function encodeUtf8(value: string): Uint8Array {
    const TextEncoderCtor = (globalThis as unknown as { TextEncoder?: new () => { encode: (v: string) => Uint8Array } })
        .TextEncoder;
    if (!TextEncoderCtor) {
        throw new Error('TextEncoder is not available in this environment.');
    }
    return new TextEncoderCtor().encode(value);
}

function base64Encode(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let output = '';

    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i] ?? 0;
        const b = bytes[i + 1] ?? 0;
        const c = bytes[i + 2] ?? 0;

        const triple = (a << 16) | (b << 8) | c;
        output += alphabet[(triple >> 18) & 63];
        output += alphabet[(triple >> 12) & 63];
        output += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=';
        output += i + 2 < bytes.length ? alphabet[triple & 63] : '=';
    }

    return output;
}

async function hmacSha256Base64(key: string, message: string): Promise<string> {
    const subtle = getSubtleCrypto();
    const keyData = encodeUtf8(key);
    const msgData = encodeUtf8(message);
    const cryptoKey = await subtle.importKey('raw', keyData, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, [
        'sign',
    ]);
    const signature = await subtle.sign({ name: 'HMAC' }, cryptoKey, msgData);
    return base64Encode(new Uint8Array(signature));
}
/**
 * Sort Query parameters (for GET requests)
 */
export function sortQueryString(queryString: string): string {
    if (!queryString) {
        return '';
    }

    // Parse parameters
    const params = new URLSearchParams(queryString);
    const sortedParams: string[] = [];

    // Sort and rebuild
    const sortedKeys = Array.from(new Set(params.keys())).sort();
    for (const key of sortedKeys) {
        const values = params.getAll(key);
        for (const value of values) {
            sortedParams.push(`${key}=${value}`);
        }
    }

    return sortedParams.join('&');
}

/**
 * Sort JSON keys (for POST JSON requests)
 * Equivalent to JSON.stringify with sorted keys
 */
export function sortJsonKeys(jsonStr: string): string {
    if (!jsonStr) {
        return '';
    }

    try {
        const data = JSON.parse(jsonStr);
        return JSON.stringify(data, Object.keys(data).sort());
    } catch (error) {
        return jsonStr;
    }
}

export function buildMessage(
    timestamp: string,
    method: string,
    requestPath: string,
    body: string = '',
    contentType: string = ''
): string {
    const upperMethod = method.toUpperCase();
    let processedPath = requestPath;
    let processedBody = body;

    // Handle GET request query parameters
    if (upperMethod === 'GET' && requestPath.includes('?')) {
        const [path, query] = requestPath.split('?', 2);
        const sortedQuery = sortQueryString(query);
        processedPath = `${path}?${sortedQuery}`;
    }

    // Handle POST request JSON body
    if (['POST', 'PUT', 'PATCH'].includes(upperMethod) && body) {
        if (contentType && contentType.toLowerCase().includes('application/json')) {
            processedBody = sortJsonKeys(body);
        }
    }

    return timestamp + upperMethod + processedPath + processedBody;
}

export async function getHeaders({
    method,
    requestPath,
    body,
    contentType,
    apiKey,
    passphrase,
    secretKey,
    timestamp: overrideTimestamp,
}: {
    method: HttpMethod | Lowercase<HttpMethod> | (string & {});
    requestPath: string;
    body?: string;
    contentType?: string;
    apiKey: string;
    passphrase: string;
    secretKey: string;
    timestamp?: string;
}): Promise<APIHeaders> {
    // ISO 8601 UTC timestamp, e.g. 2020-12-08T09:08:57.715Z
    const timestamp = overrideTimestamp ?? new Date().toISOString();
    const message = buildMessage(timestamp, method, requestPath, body, contentType);
    const signature = await hmacSha256Base64(secretKey, message);

    const headers: APIHeaders = {
        'X-ACCESS-KEY': apiKey,
        'X-ACCESS-SIGN': signature,
        'X-ACCESS-TIMESTAMP': timestamp,
        'X-ACCESS-PASSPHRASE': passphrase,
    };

    if (contentType) {
        headers['Content-Type'] = contentType;
    }

    return headers;
}
