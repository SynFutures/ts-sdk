import shared from './jest.shared.js';

/** @type {import('jest').Config} */
export default {
    ...shared,
    displayName: 'devnet',
    testMatch: ['<rootDir>/src/tests/devnet/**/*.test.ts'],
    maxWorkers: 1,
    testTimeout: 120_000,
    openHandlesTimeout: 5_000,
    globalSetup: '<rootDir>/scripts/devnet/jest/globalSetup.js',
    globalTeardown: '<rootDir>/scripts/devnet/jest/globalTeardown.js',
    setupFilesAfterEnv: ['<rootDir>/src/tests/devnet/jest.setup.ts'],
};
