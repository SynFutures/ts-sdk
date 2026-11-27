/** @type {import('jest').Config} */
export default {
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: { '^.+\\.tsx?$': ['@swc/jest', { jsc: { target: 'es2022', parser: { syntax: 'typescript' } } }] },
    testEnvironment: 'node',
    clearMocks: true,
    restoreMocks: true,
};
