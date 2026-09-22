import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        types: 'src/types/index.ts',
        actions: 'src/actions/index.ts',
        queries: 'src/queries/index.ts',
        apis: 'src/apis/index.ts',
        abis: 'src/abis/index.ts',
        parsers: 'src/parsers/index.ts',
        frontend: 'src/frontend/index.ts',
        utils: 'src/utils/index.ts',
        math: 'src/math.ts',
        constants: 'src/constants.ts',
    },
    format: ['cjs', 'esm'],
    target: 'es2022',
    platform: 'neutral',
    dts: true,
    clean: true,
    sourcemap: true,
    outputOptions: { sourcemapExcludeSources: true },
    // Keep runtime dependencies external; both formats share chunks across their entries.
    deps: { neverBundle: [/^node:/, /^viem(?:\/|$)/, /^@derivation-tech\//, /^@synfutures\//, 'ws'] },
    outDir: 'dist',
    outExtensions({ format }) {
        return { js: format === 'es' ? '.mjs' : '.cjs', dts: format === 'es' ? '.d.ts' : '.d.cts' };
    },
});
