import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import typescript from 'typescript-eslint';

export default [
    {
        ignores: ['**/dist/**', '**/coverage/**', '**/devnet/.runtime/**', '.worktrees/**', 'templates', '**/*.d.ts'],
    },
    eslint.configs.recommended,
    ...typescript.configs.recommended,
    {
        files: ['packages/perpv3-ts/scripts/devnet/**/*.js'],
        languageOptions: {
            globals: {
                clearInterval: 'readonly',
                clearTimeout: 'readonly',
                fetch: 'readonly',
                process: 'readonly',
                setInterval: 'readonly',
                setTimeout: 'readonly',
            },
        },
    },
    {
        files: ['scripts/**/*.{js,cjs}'],
        languageOptions: {
            globals: {
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                clearInterval: 'readonly',
                clearTimeout: 'readonly',
                console: 'readonly',
                fetch: 'readonly',
                module: 'readonly',
                process: 'readonly',
                require: 'readonly',
                setInterval: 'readonly',
                setTimeout: 'readonly',
            },
        },
    },
    {
        rules: {
            'no-empty': 'off',
            'no-console': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    // prettier should be the last config because it disables all formatting rules
    prettier,
];
