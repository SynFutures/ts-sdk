const eslint = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const typescript = require('typescript-eslint');

module.exports = [
    {
        ignores: ['**/dist/*', 'jest.config.js', 'eslint.config.js', 'templates', '**/*.d.ts'],
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
        rules: {
            'no-empty': 'off',
            'no-console': 'off',
            'ts/consistent-type-imports': 'off',
            'node/prefer-global/process': 'off',
            'node/prefer-global/buffer': 'off',
            'regexp/no-super-linear-backtracking': 'off',
            'regexp/no-contradiction-with-assertion': 'off',
            'regexp/no-unused-capturing-group': 'off',
            'regexp/no-useless-quantifier': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            // Enforce no trailing spaces - coding practice rule
            'no-trailing-spaces': 'error',
        },
    },
    // prettier should be the last config because it disables all formatting rules
    prettier,
];
