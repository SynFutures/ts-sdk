import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { log } from 'node:console';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = resolve(packageDir, '../..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const consumerNode = process.env.PERPV3_CONSUMER_NODE || process.execPath;
const temporary = mkdtempSync(join(tmpdir(), 'perpv3-consumer-'));
const consumer = join(temporary, 'consumer');
const env = {
    PATH: process.env.PATH,
    TMPDIR: temporary,
    pnpm_config_userconfig: '/dev/null',
    pnpm_config_ignore_scripts: 'true',
};
function run(command, args, cwd = consumer) {
    return execFileSync(command, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function sameFiles(expected, installed) {
    for (const entry of readdirSync(expected, { withFileTypes: true })) {
        const relative = entry.name;
        if (entry.isDirectory()) sameFiles(join(expected, relative), join(installed, relative));
        else
            assert.deepEqual(readFileSync(join(installed, relative)), readFileSync(join(expected, relative)), relative);
    }
}
try {
    mkdirSync(consumer);
    // pnpm resolves catalog specifiers in the packed manifest; lifecycle hooks stay disabled.
    run('pnpm', ['pack', '--pack-destination', temporary], packageDir);
    const archive = readdirSync(temporary).find((name) => name.endsWith('.tgz'));
    assert(archive, 'Missing PerpV3 tarball');
    const archivePath = join(temporary, archive);
    log(run('pnpm', ['exec', 'publint', archivePath, '--strict'], packageDir).trim());
    // The SDK uses exports-aware resolution (Node16/NodeNext/Bundler), not legacy node10.
    log(run('pnpm', ['exec', 'attw', archivePath, '--profile', 'node16'], packageDir).trim());
    const kit = '@derivation-tech/viem-kit';
    const overrides = JSON.parse(run('pnpm', ['config', 'get', 'overrides', '--json'], workspaceDir));
    const override = overrides?.[kit];
    const kitArchive = override?.startsWith('file:') ? resolve(workspaceDir, override.slice(5)) : undefined;
    const fixture = {
        private: true,
        type: 'module',
        dependencies: { [manifest.name]: `file:${archivePath}` },
        devDependencies: { '@types/node': manifest.devDependencies['@types/node'] },
        ...(kitArchive && { overrides: { [kit]: `file:${kitArchive}` } }),
    };
    writeFileSync(join(consumer, 'package.json'), JSON.stringify(fixture));
    // A caller testing a released private dependency may supply a scoped npmrc for installation only.
    const userconfig = !kitArchive && process.env.NPM_CONFIG_USERCONFIG;
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
        cwd: consumer,
        env: {
            ...env,
            NPM_CONFIG_USERCONFIG: userconfig || '/dev/null',
            ...(userconfig && { NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN }),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const installed = join(consumer, 'node_modules', manifest.name);
    const packed = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
    assert(!Object.values(packed.dependencies).includes('catalog:'), 'Unresolved catalog dependency');
    if (kitArchive) {
        const expected = join(temporary, 'viem-kit');
        mkdirSync(expected);
        run('tar', ['-xzf', kitArchive, '-C', expected, '--strip-components=1']);
        const kitManifest = JSON.parse(readFileSync(join(expected, 'package.json'), 'utf8'));
        assert.equal(packed.dependencies[kit], kitManifest.version, 'Packed dependency must match vendored kit');
        sameFiles(expected, join(consumer, 'node_modules', kit));
    }
    cpSync(join(packageDir, 'typecheck/consumer.ts'), join(consumer, 'index.mts'));
    cpSync(join(packageDir, 'typecheck/consumer.ts'), join(consumer, 'index.cts'));
    writeFileSync(
        join(consumer, 'tsconfig.json'),
        JSON.stringify({
            compilerOptions: {
                target: 'ES2022',
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                strict: true,
                skipLibCheck: true,
                outDir: 'dist',
            },
            include: ['index.mts', 'index.cts'],
        })
    );
    run('pnpm', ['exec', 'tsc', '-p', join(consumer, 'tsconfig.json')], packageDir);
    run(consumerNode, ['--disallow-code-generation-from-strings', 'dist/index.mjs']);
    run(consumerNode, ['--disallow-code-generation-from-strings', 'dist/index.cjs']);
    const entries = Object.keys(packed.exports).filter((key) => key !== './package.json');
    const importAll = entries
        .map(
            (entry, i) => `import * as e${i} from '${manifest.name}${entry === '.' ? '' : entry.slice(1)}'; void e${i};`
        )
        .join('\n');
    writeFileSync(join(consumer, 'entries.mjs'), importAll);
    writeFileSync(
        join(consumer, 'entries.cjs'),
        entries.map((entry) => `require('${manifest.name}${entry === '.' ? '' : entry.slice(1)}');`).join('\n')
    );
    run(consumerNode, ['--disallow-code-generation-from-strings', 'entries.mjs']);
    run(consumerNode, ['--disallow-code-generation-from-strings', 'entries.cjs']);
    const browser = join(temporary, 'browser.cjs');
    const bundle = await build({
        entryPoints: [join(consumer, 'dist/index.mjs')],
        outfile: browser,
        platform: 'browser',
        format: 'iife',
        bundle: true,
        metafile: true,
        logLevel: 'silent',
    });
    assert(
        !Object.keys(bundle.metafile.inputs).some(
            (name) => name.includes('viem-ledger') || name.includes('/viem-kit/dist/node/')
        ),
        'Node tooling entered browser bundle'
    );
    run(consumerNode, ['--disallow-code-generation-from-strings', browser]);
    log(
        `Packed consumer passed on Node ${run(consumerNode, ['-p', 'process.versions.node']).trim()}: ${entries.length} ESM/CJS entries, NodeNext types, shared entry identity, calldata/parser runtime, browser bundle, clean npm install`
    );
} catch (error) {
    if (error.stdout) log(error.stdout.toString());
    if (error.stderr) log(error.stderr.toString());
    throw error;
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
