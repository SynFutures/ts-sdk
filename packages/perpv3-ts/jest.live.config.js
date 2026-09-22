import shared from './jest.shared.js';

/** @type {import('jest').Config} */
export default {
    ...shared,
    displayName: 'live',
    testMatch: ['<rootDir>/src/tests/live/**/*.test.ts'],
    maxWorkers: 1,
    testTimeout: 120_000,
};
