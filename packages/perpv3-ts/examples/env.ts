import { loadEnvFile } from 'node:process';

export function loadExampleEnv(): void {
    try {
        loadEnvFile();
    } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
}
