describe('API export surface', () => {
    test('apis root exposes module classes without legacy function helpers', async () => {
        const apis = await import('../apis');

        expect(typeof apis.MarketModule).toBe('function');
        expect(typeof apis.MarketMakerModule).toBe('function');
        expect(typeof apis.PublicModule).toBe('function');
        expect('fetchFuturesInstrumentInquire' in apis).toBe(false);
        expect('fetchMarketOnChainContext' in apis).toBe(false);
        expect('httpClient' in apis).toBe(false);
    });

    test('legacy function helper compat module is removed from source and build entries', async () => {
        const { readFile } = await import('node:fs/promises');
        const { resolve } = await import('node:path');
        const packageJson = JSON.parse(await readFile(resolve(__dirname, '../../package.json'), 'utf8')) as {
            exports?: Record<string, unknown>;
        };
        const tsupConfig = await readFile(resolve(__dirname, '../../tsup.config.ts'), 'utf8');

        expect(packageJson.exports).not.toHaveProperty('./apis/compat');
        expect(tsupConfig).not.toContain('apis/compat');
        await expect(readFile(resolve(__dirname, '../apis/compat.ts'), 'utf8')).rejects.toThrow();
    });

    test('query helpers do not depend on a legacy compat API layer', async () => {
        const { readFile } = await import('node:fs/promises');
        const { resolve } = await import('node:path');
        const queryFiles = ['../queries/index.ts', '../queries/api.ts'];

        await Promise.all(
            queryFiles.map(async (queryFile) => {
                const source = await readFile(resolve(__dirname, queryFile), 'utf8');
                expect(source).not.toContain('apis/compat');
            })
        );
    });
});
