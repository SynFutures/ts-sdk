import { describe, expect, test } from '@jest/globals';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getRequestUrlWithQuery, HttpClient } from '../../utils';

describe('HttpClient retries', () => {
    test.each(['post', 'put', 'delete'] as const)('does not repeat a failed %s request', async (method) => {
        let requestCount = 0;
        const server = createServer((_req, res) => {
            requestCount += 1;
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'response unavailable' }));
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            const { port } = server.address() as AddressInfo;
            const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}`, retries: 2 });
            await expect(client[method]('/write')).rejects.toThrow('response unavailable');
            expect(requestCount).toBe(1);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    test('reports the server msg field', async () => {
        const server = createServer((_req, res) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 500, msg: 'invalid symbol', data: null }));
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            const { port } = server.address() as AddressInfo;
            const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}`, retries: 0 });
            await expect(client.get('/read')).rejects.toThrow('invalid symbol');
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    test('retries once on 5xx and succeeds', async () => {
        let requestCount = 0;
        const server = createServer((_req, res) => {
            requestCount += 1;
            if (requestCount === 1) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'temporary failure' }));
                return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
        });

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

        try {
            const { port } = server.address() as AddressInfo;
            const client = new HttpClient({
                baseUrl: `http://127.0.0.1:${port}`,
                retries: 1,
                timeout: 2_000,
            });

            const response = await client.get<{ ok: boolean }>('/test');
            expect(response.status).toBe(200);
            expect(response.data).toEqual({ ok: true });
            expect(requestCount).toBe(2);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});

describe('query serialization', () => {
    test('preserves explicit zero and false values while omitting nullish values', () => {
        expect(
            getRequestUrlWithQuery('/test', {
                active: false,
                depth: 0,
                empty: null,
                missing: undefined,
                symbol: 'BTC-USDC',
            })
        ).toBe('/test?active=false&depth=0&symbol=BTC-USDC');
    });
});
