import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { log } from 'node:console';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = resolve(packageDir, '../..');
const require = createRequire(join(packageDir, 'package.json'));
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const consumerNode = process.env.PERPV3_CONSUMER_NODE || process.execPath;
const temporary = mkdtempSync(join(tmpdir(), 'perpv3-consumer-'));
const consumer = join(temporary, 'consumer');
const env = {
    PATH: process.env.PATH,
    TMPDIR: temporary,
    npm_config_userconfig: '/dev/null',
    npm_config_ignore_scripts: 'true',
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
    const installed = join(consumer, 'node_modules/@synfutures/perpv3-ts');
    mkdirSync(installed, { recursive: true });
    run('tar', ['-xzf', join(temporary, archive), '-C', installed, '--strip-components=1']);
    const packed = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
    assert(!Object.values(packed.dependencies).includes('catalog:'), 'Unresolved catalog dependency');
    for (const name of [...Object.keys(manifest.dependencies), '@types/node']) {
        const link = join(consumer, 'node_modules', name);
        mkdirSync(dirname(link), { recursive: true });
        symlinkSync(resolve(packageDir, 'node_modules', name), link, 'dir');
    }
    const workspace = JSON.parse(readFileSync(join(workspaceDir, 'package.json'), 'utf8'));
    const override = workspace.pnpm?.overrides?.['@derivation-tech/viem-kit'];
    if (override?.startsWith('file:')) {
        const expected = join(temporary, 'viem-kit');
        mkdirSync(expected);
        run('tar', ['-xzf', resolve(workspaceDir, override.slice(5)), '-C', expected, '--strip-components=1']);
        sameFiles(expected, resolve(packageDir, 'node_modules/@derivation-tech/viem-kit'));
    }
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
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
    run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json']);
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
    const tsupRequire = createRequire(require.resolve('tsup/package.json'));
    const { build } = tsupRequire('esbuild');
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
        `Packed consumer passed on Node ${run(consumerNode, ['-p', 'process.versions.node']).trim()}: ${entries.length} ESM/CJS entries, NodeNext types, calldata/parser runtime, browser bundle, exact viem-kit tarball files`
    );
} catch (error) {
    if (error.stdout) log(error.stdout.toString());
    if (error.stderr) log(error.stderr.toString());
    throw error;
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
