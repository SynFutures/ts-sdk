import crypto from 'node:crypto';
import { buildMessage, getHeaders } from '../utils/mm';

describe('buildMessage', () => {
    it('builds message for simple GET request without query params', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'GET';
        const path = '/v4/public/market/instrument';
        const result = buildMessage(timestamp, method, path);
        expect(result).toBe('2020-12-08T09:08:57.715ZGET/v4/public/market/instrument');
    });

    it('sorts query parameters for GET requests', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'GET';
        const path = '/v4/public/market/instrument?b=2&a=1&c=3';
        const result = buildMessage(timestamp, method, path);
        expect(result).toBe('2020-12-08T09:08:57.715ZGET/v4/public/market/instrument?a=1&b=2&c=3');
    });

    it('handles GET request with empty query string', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'GET';
        const path = '/v4/public/market/instrument?';
        const result = buildMessage(timestamp, method, path);
        expect(result).toBe('2020-12-08T09:08:57.715ZGET/v4/public/market/instrument?');
    });

    it('sorts JSON keys for POST requests with application/json content type', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'POST';
        const path = '/v4/private/some-endpoint';
        const body = JSON.stringify({ z: 3, a: 1, m: 2 });
        const contentType = 'application/json';
        const result = buildMessage(timestamp, method, path, body, contentType);
        expect(result).toBe('2020-12-08T09:08:57.715ZPOST/v4/private/some-endpoint{"a":1,"m":2,"z":3}');
    });

    it('sorts JSON keys for PUT requests with application/json content type', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'PUT';
        const path = '/v4/private/update';
        const body = JSON.stringify({ name: 'test', id: 123 });
        const contentType = 'application/json';
        const result = buildMessage(timestamp, method, path, body, contentType);
        expect(result).toBe('2020-12-08T09:08:57.715ZPUT/v4/private/update{"id":123,"name":"test"}');
    });

    it('sorts JSON keys for PATCH requests with application/json content type', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'PATCH';
        const path = '/v4/private/patch';
        const body = JSON.stringify({ value: 456, key: 'test' });
        const contentType = 'application/json';
        const result = buildMessage(timestamp, method, path, body, contentType);
        expect(result).toBe('2020-12-08T09:08:57.715ZPATCH/v4/private/patch{"key":"test","value":456}');
    });

    it('does not sort body for POST requests without application/json content type', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'POST';
        const path = '/v4/private/some-endpoint';
        const body = 'plain text body';
        const contentType = 'text/plain';
        const result = buildMessage(timestamp, method, path, body, contentType);
        expect(result).toBe('2020-12-08T09:08:57.715ZPOST/v4/private/some-endpointplain text body');
    });

    it('does not sort body for POST requests without content type', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'POST';
        const path = '/v4/private/some-endpoint';
        const body = JSON.stringify({ b: 2, a: 1 });
        const result = buildMessage(timestamp, method, path, body);
        expect(result).toBe('2020-12-08T09:08:57.715ZPOST/v4/private/some-endpoint{"b":2,"a":1}');
    });

    it('handles empty body for POST requests', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'POST';
        const path = '/v4/private/some-endpoint';
        const result = buildMessage(timestamp, method, path, '');
        expect(result).toBe('2020-12-08T09:08:57.715ZPOST/v4/private/some-endpoint');
    });

    it('converts method to uppercase', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'post';
        const path = '/v4/private/some-endpoint';
        const result = buildMessage(timestamp, method, path);
        expect(result).toBe('2020-12-08T09:08:57.715ZPOST/v4/private/some-endpoint');
    });

    it('handles DELETE requests without body', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'DELETE';
        const path = '/v4/private/resource/123';
        const result = buildMessage(timestamp, method, path);
        expect(result).toBe('2020-12-08T09:08:57.715ZDELETE/v4/private/resource/123');
    });

    it('handles case-insensitive content type matching', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'POST';
        const path = '/v4/private/some-endpoint';
        const body = JSON.stringify({ b: 2, a: 1 });
        const contentType = 'APPLICATION/JSON';
        const result = buildMessage(timestamp, method, path, body, contentType);
        expect(result).toBe('2020-12-08T09:08:57.715ZPOST/v4/private/some-endpoint{"a":1,"b":2}');
    });

    it('handles content type with charset', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'POST';
        const path = '/v4/private/some-endpoint';
        const body = JSON.stringify({ z: 3, a: 1 });
        const contentType = 'application/json; charset=utf-8';
        const result = buildMessage(timestamp, method, path, body, contentType);
        expect(result).toBe('2020-12-08T09:08:57.715ZPOST/v4/private/some-endpoint{"a":1,"z":3}');
    });

    it('handles GET request with multiple query parameters with same key', () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const method = 'GET';
        const path = '/v4/public/market/instrument?tags=tag1&tags=tag2&symbol=BTC';
        const result = buildMessage(timestamp, method, path);
        expect(result).toBe('2020-12-08T09:08:57.715ZGET/v4/public/market/instrument?symbol=BTC&tags=tag1&tags=tag2');
    });
});

describe('getHeaders', () => {
    it('signs GET request paths with sorted query params', async () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const apiKey = 'test-api-key';
        const passphrase = 'test-passphrase';
        const secretKey = 'test-secret';
        const requestPath = '/v4/public/market/instrument?b=2&a=1';

        const message = buildMessage(timestamp, 'GET', requestPath);
        const expectedSignature = crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('base64');

        const headers = await getHeaders({
            method: 'GET',
            requestPath,
            apiKey,
            passphrase,
            secretKey,
            timestamp,
        });

        expect(headers['X-ACCESS-SIGN']).toBe(expectedSignature);
        expect(headers['X-ACCESS-TIMESTAMP']).toBe(timestamp);
        expect(headers['X-ACCESS-KEY']).toBe(apiKey);
        expect(headers['X-ACCESS-PASSPHRASE']).toBe(passphrase);
    });

    it('signs JSON bodies with sorted keys for POST', async () => {
        const timestamp = '2020-12-08T09:08:57.715Z';
        const apiKey = 'test-api-key';
        const passphrase = 'test-passphrase';
        const secretKey = 'test-secret';
        const requestPath = '/v4/private/some-endpoint';
        const body = JSON.stringify({ b: 2, a: 1 });
        const contentType = 'application/json';

        const message = buildMessage(timestamp, 'post', requestPath, body, contentType);
        const expectedSignature = crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('base64');

        const headers = await getHeaders({
            method: 'post',
            requestPath,
            body,
            contentType,
            apiKey,
            passphrase,
            secretKey,
            timestamp,
        });

        expect(headers['X-ACCESS-SIGN']).toBe(expectedSignature);
        expect(headers['X-ACCESS-TIMESTAMP']).toBe(timestamp);
        expect(headers['Content-Type']).toBe(contentType);
    });
});
