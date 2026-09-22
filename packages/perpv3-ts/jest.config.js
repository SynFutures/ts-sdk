import shared from './jest.shared.js';

/** @type {import('jest').Config} */
export default {
    ...shared,
    displayName: 'unit',
    testMatch: ['<rootDir>/src/tests/unit/**/*.test.ts'],
    collectCoverageFrom: ['src/**/*.ts', '!src/tests/**', '!src/abis/**', '!src/**/*.d.ts'],
};
