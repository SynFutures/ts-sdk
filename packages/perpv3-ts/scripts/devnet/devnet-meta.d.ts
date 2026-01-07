export type DevnetPaths = {
    packageRoot: string;
    devnetRoot: string;
    presetPath: string;
    contractsPackageName: string;
    contractsPackageDir: string;
    contractsArtifactsDir: string;
    statePath: string;
    manifestPath: string;
    metaPath: string;
};

export type ExpectedStateMeta = {
    harnessVersion: number;
    anvilPackageVersion: string;
    contractsPackageName: string;
    contractsPackageVersion: string;
    presetHash: string;
    contractsArtifactsHash: string;
    cacheKey: string;
};

export function getDevnetPaths(): DevnetPaths;
export function computeArtifactsHash(artifactsDir: string): string;
export function computeArtifactsHashFromFiles(entries: Array<{ id: string; filePath: string }>): string;
export function computeContractsArtifactsHash(contractsArtifactsDir: string): string;
export function computePresetHash(presetPath: string): string;
export function readAnvilPackageVersion(packageRoot: string): string;
export function readInstalledPackageVersion(packageDir: string, packageNameForError: string): string;
export function computeExpectedStateMeta(): ExpectedStateMeta;
export function readStateMeta(metaPath: string): { cacheKey: string } & Record<string, unknown> | null;
export function assertStateFresh(): {
    expected: ExpectedStateMeta;
    existing: { cacheKey: string } & Record<string, unknown>;
    paths: DevnetPaths;
};
export function getFileSizeBytes(filePath: string): number;
