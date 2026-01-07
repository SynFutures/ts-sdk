/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    testMatch: ['**/src/tests/devnet/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    testEnvironment: 'node',
    maxWorkers: 1,
    testTimeout: 120_000,
    openHandlesTimeout: 5_000,
    globalSetup: './scripts/devnet/jest/globalSetup.js',
    globalTeardown: './scripts/devnet/jest/globalTeardown.js',
    setupFilesAfterEnv: ['./src/tests/devnet/jest.setup.ts'],
};
