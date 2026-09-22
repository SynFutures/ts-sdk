import { defineConfig } from 'tsup';

export default defineConfig({
    // Each entry generates separate CJS and ESM bundles
    entry: {
        index: 'src/index.ts', // Main export (everything)
        types: 'src/types/index.ts', // Type definitions
        actions: 'src/actions/index.ts', // Trading operations
        queries: 'src/queries/index.ts', // Data fetching
        apis: 'src/apis/index.ts', // API client & WebSocket
        abis: 'src/abis/index.ts', // Contract ABIs
        parsers: 'src/parsers/index.ts', // Event parsing
        frontend: 'src/frontend/index.ts', // Frontend utilities
        utils: 'src/utils/index.ts', // Utility functions
        math: 'src/math.ts', // Math operations
        constants: 'src/constants.ts', // Constants
    },

    // Dual format output
    format: ['cjs', 'esm'],

    target: 'es2022',

    // Type definitions
    dts: true,

    // Code splitting (effective for ESM)
    splitting: true,

    // Tree shaking
    treeshake: {
        preset: 'recommended',
    },

    // Source maps (without embedded source code)
    sourcemap: true,

    // Disable sourcesContent to avoid publishing source code in .map files
    esbuildOptions(options) {
        options.sourcesContent = false;
    },

    // Clean old artifacts
    clean: true,

    // Don't bundle external dependencies
    external: ['viem', /^@derivation-tech\//, /^@synfutures/, 'axios', 'ws', 'date-fns', 'date-fns-tz'],

    // Output file extensions
    outDir: 'dist',
    outExtension({ format }) {
        return {
            js: format === 'cjs' ? '.cjs' : '.mjs',
        };
    },

    // Don't minify (let user's bundler handle it)
    minify: false,

    // Only keep valid side effects
    noExternal: [],
});
