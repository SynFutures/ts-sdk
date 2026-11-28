import { existsSync } from 'node:fs';
import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: existsSync('src/tge.ts') ? ['src/index.ts', 'src/tge.ts'] : ['src/index.ts'],
    format: ['esm', 'cjs'],
    cwd: process.cwd(),
    target: 'es2022',
    platform: 'neutral',
    dts: true,
    deps: { neverBundle: [/^viem(?:\/|$)/] },
    outExtensions: ({ format }) => (format === 'es' ? { js: '.mjs', dts: '.d.mts' } : { js: '.cjs', dts: '.d.cts' }),
});
