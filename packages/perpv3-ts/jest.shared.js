/** @type {import('jest').Config} */
export default {
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.tests.json' }] },
    testEnvironment: 'node',
    clearMocks: true,
    restoreMocks: true,
};
