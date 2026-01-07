import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HARNESS_VERSION = 1;
const V3_CONTRACTS_PACKAGE_NAME = '@synfutures/v3-contracts';

const CORE_ARTIFACT_RELATIVE_PATHS = [
    'contracts/Beacon.sol/Beacon.json',
    'contracts/Config.sol/Config.json',
    'contracts/Gate.sol/Gate.json',
    'contracts/Instrument.sol/Instrument.json',
    'contracts/InstrumentProxy.sol/InstrumentProxy.json',
    'contracts/Observer.sol/Observer.json',
    'contracts/GelatoRelayRouter/GelatoRelayRouter.sol/GelatoRelayRouter.json',
    'contracts/markets/link/ChainlinkMarket.sol/ChainlinkMarket.json',
    'contracts/markets/emg/EmergingMarket.sol/EmergingMarket.json',
    'contracts/markets/pyth/PythMarket.sol/PythMarket.json',
    'contracts/markets/dexv2/DexV2Market.sol/DexV2Market.json',
    'contracts/libraries/Broker.sol/Broker.json',
    'contracts/libraries/Liquidity.sol/Liquidity.json',
    'contracts/libraries/Oyster.sol/Oyster.json',
    'contracts/libraries/LibQuery.sol/LibQuery.json',
    'contracts/libraries/LibObserver.sol/LibObserver.json',
    'contracts/test/MockChainlinkFeeder.sol/MockChainlinkFeeder.json',
    'contracts/test/local/TestToken.sol/TestToken.json',
    'contracts/test/local/WrappedNative.sol/WrappedNative.json',
    'contracts/peripheral/Helper.sol/Helper.json',
    'contracts/peripheral/lib/LibPeripheral.sol/LibPeripheral.json',
    'contracts/markets/emg/EmergingFeederFactory.sol/EmergingFeederFactory.json',
    '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json',
];

function computeInstalledPackageDir(packageRoot, packageName) {
    if (!packageName.startsWith('@')) {
        return path.join(packageRoot, 'node_modules', packageName);
    }
    const [scope, name] = packageName.split('/');
    if (!scope || !name) {
        throw new Error(`Invalid scoped package name: ${packageName}`);
    }
    return path.join(packageRoot, 'node_modules', scope, name);
}

function sha256Hex(data) {
    return createHash('sha256').update(data).digest('hex');
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const sortedKeys = Object.keys(value).sort();
    return `{${sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function safeReadJson(filePath) {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

export function getDevnetPaths() {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const packageRoot = path.resolve(scriptDir, '..', '..');
    const devnetRoot = path.join(packageRoot, 'devnet');
    const contractsPackageDir = computeInstalledPackageDir(packageRoot, V3_CONTRACTS_PACKAGE_NAME);
    return {
        packageRoot,
        devnetRoot,
        presetPath: path.join(devnetRoot, 'preset.json'),
        contractsPackageName: V3_CONTRACTS_PACKAGE_NAME,
        contractsPackageDir,
        contractsArtifactsDir: path.join(contractsPackageDir, 'artifacts'),
        statePath: path.join(devnetRoot, 'state.json'),
        manifestPath: path.join(devnetRoot, 'manifest.json'),
        metaPath: path.join(devnetRoot, 'state.meta.json'),
    };
}

export function computeArtifactsHash(artifactsDir) {
    const entries = readdirSync(artifactsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

    const parts = [];
    for (const name of entries) {
        const fullPath = path.join(artifactsDir, name);
        const raw = readFileSync(fullPath);
        parts.push(`${name}\0${sha256Hex(raw)}\n`);
    }
    return sha256Hex(parts.join(''));
}

export function computeArtifactsHashFromFiles(entries) {
    const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
    const parts = [];
    for (const { id, filePath } of sorted) {
        const raw = readFileSync(filePath);
        parts.push(`${id}\0${sha256Hex(raw)}\n`);
    }
    return sha256Hex(parts.join(''));
}

export function computeContractsArtifactsHash(contractsArtifactsDir) {
    const entries = CORE_ARTIFACT_RELATIVE_PATHS.map((relativePath) => ({
        id: relativePath,
        filePath: path.join(contractsArtifactsDir, relativePath),
    }));
    for (const { filePath } of entries) {
        if (!existsSync(filePath)) {
            throw new Error(
                `Missing core artifact file at ${filePath}. ` +
                    `Check ${V3_CONTRACTS_PACKAGE_NAME} package contents or update devnet harness paths.`
            );
        }
    }
    return computeArtifactsHashFromFiles(entries);
}

export function computePresetHash(presetPath) {
    const preset = safeReadJson(presetPath);
    return sha256Hex(stableStringify(preset));
}

export function readAnvilPackageVersion(packageRoot) {
    const pkgJsonPath = path.join(packageRoot, 'node_modules', '@foundry-rs', 'anvil', 'package.json');
    if (!existsSync(pkgJsonPath)) {
        throw new Error(`Missing dependency @foundry-rs/anvil at ${pkgJsonPath}. Run pnpm install first.`);
    }
    const pkgJson = safeReadJson(pkgJsonPath);
    if (typeof pkgJson.version !== 'string') {
        throw new Error(`Invalid @foundry-rs/anvil package.json: missing version.`);
    }
    return pkgJson.version;
}

export function readInstalledPackageVersion(packageDir, packageNameForError) {
    const pkgJsonPath = path.join(packageDir, 'package.json');
    if (!existsSync(pkgJsonPath)) {
        throw new Error(`Missing dependency ${packageNameForError} at ${pkgJsonPath}. Run pnpm install first.`);
    }
    const pkgJson = safeReadJson(pkgJsonPath);
    if (typeof pkgJson.version !== 'string') {
        throw new Error(`Invalid ${packageNameForError} package.json: missing version.`);
    }
    return pkgJson.version;
}

export function computeExpectedStateMeta() {
    const paths = getDevnetPaths();
    const presetHash = computePresetHash(paths.presetPath);
    const anvilPackageVersion = readAnvilPackageVersion(paths.packageRoot);
    const contractsPackageVersion = readInstalledPackageVersion(paths.contractsPackageDir, paths.contractsPackageName);
    const contractsArtifactsHash = computeContractsArtifactsHash(paths.contractsArtifactsDir);
    const payload = {
        harnessVersion: HARNESS_VERSION,
        anvilPackageVersion,
        contractsPackageName: paths.contractsPackageName,
        contractsPackageVersion,
        presetHash,
        contractsArtifactsHash,
    };
    const cacheKey = sha256Hex(stableStringify(payload));
    return {
        ...payload,
        cacheKey,
    };
}

export function readStateMeta(metaPath) {
    if (!existsSync(metaPath)) return null;
    const meta = safeReadJson(metaPath);
    if (!meta || typeof meta !== 'object') return null;
    if (typeof meta.cacheKey !== 'string') return null;
    return meta;
}

export function assertStateFresh() {
    const paths = getDevnetPaths();

    if (!existsSync(paths.statePath)) {
        throw new Error(
            `Missing devnet state at ${paths.statePath}. Run: pnpm -C packages/perpv3-ts run devnet:regen`
        );
    }

    const expected = computeExpectedStateMeta();
    const existing = readStateMeta(paths.metaPath);

    if (!existing) {
        throw new Error(
            `Missing devnet meta at ${paths.metaPath}. Run: pnpm -C packages/perpv3-ts run devnet:regen`
        );
    }

    if (existing.cacheKey !== expected.cacheKey) {
        throw new Error(
            [
                `Devnet snapshot is stale.`,
                `- expected cacheKey: ${expected.cacheKey}`,
                `- existing cacheKey: ${existing.cacheKey}`,
                `Run: pnpm -C packages/perpv3-ts run devnet:regen`,
            ].join('\n')
        );
    }

    return { expected, existing, paths };
}

export function getFileSizeBytes(filePath) {
    return statSync(filePath).size;
}
