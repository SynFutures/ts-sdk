import { fileURLToPath } from 'node:url';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import typescript from 'typescript-eslint';

export default defineConfig(
    globalIgnores(['**/dist/**', '**/coverage/**', '**/devnet/.runtime/**', '.worktrees/**', '**/*.d.{ts,cts,mts}']),
    {
        files: ['**/*.{js,cjs,mjs}'],
        extends: [eslint.configs.recommended],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['**/*.{ts,cts,mts}'],
        extends: [eslint.configs.recommended, typescript.configs.recommended],
        rules: {
            'no-empty': ['error', { allowEmptyCatch: true }],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
            ],
        },
    },
    {
        files: ['packages/perpv3-ts/src/**/*.ts', 'packages/perpv3-ts/examples/**/*.ts'],
        ignores: ['packages/perpv3-ts/src/tests/**', 'packages/perpv3-ts/src/abis/**'],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)) },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
        },
    },
    {
        // Fixtures deliberately include unused values and malformed input for negative cases.
        files: ['packages/perpv3-ts/src/tests/**/*.ts', 'packages/perpv3-ts/typecheck/**/*.ts'],
        rules: { '@typescript-eslint/no-unused-vars': 'off' },
    },
    // Formatting belongs to Prettier; disable conflicting lint rules last.
    prettier
);
