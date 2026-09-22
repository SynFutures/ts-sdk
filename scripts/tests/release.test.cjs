const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const { test } = require('node:test');

const workspace = resolve(__dirname, '../..');
const sdk = '@synfutures/perpv3-ts';
const packageFiles = ['package.json', 'packages/perpv3-ts/package.json'];
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 4) + '\n');

function fixture(t) {
    const cwd = mkdtempSync(join(tmpdir(), 'perpv3-release-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    // Copy release inputs only; never use the checkout's Git metadata, credentials or pending changesets.
    for (const file of [
        ...packageFiles,
        'pnpm-workspace.yaml',
        '.changeset/config.json',
        'packages/perpv3-ts/scripts/check-release-dependency.mjs',
    ]) {
        mkdirSync(dirname(join(cwd, file)), { recursive: true });
        copyFileSync(join(workspace, file), join(cwd, file));
    }
    symlinkSync(join(workspace, 'node_modules'), join(cwd, 'node_modules'), 'dir');
    // Exercise the real release commands without registry dependencies or a populated pnpm cache.
    for (const file of packageFiles) {
        const manifest = readJson(join(cwd, file));
        for (const field of [
            'dependencies',
            'devDependencies',
            'peerDependencies',
            'peerDependenciesMeta',
            'optionalDependencies',
        ]) {
            delete manifest[field];
        }
        delete manifest.pnpm;
        if (!manifest.private) manifest.version = '1.2.3';
        writeJson(join(cwd, file), manifest);
    }
    const rootManifest = readJson(join(cwd, 'package.json'));
    const env = {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        HOME: cwd,
        CI: 'true',
        npm_config_userconfig: '/dev/null',
        npm_config_offline: 'true',
        npm_config_ignore_scripts: 'true',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
    };
    function run(command, args, expectedStatus = 0) {
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120_000 });
        assert.ifError(result.error);
        assert.equal(result.status, expectedStatus, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
        return result.stdout + result.stderr;
    }
    run('pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile', '--offline', '--ignore-scripts']);
    // A deliberately stale importer makes the lock refresh observable without a registry dependency.
    rootManifest.devDependencies = { [sdk]: 'workspace:*' };
    writeJson(join(cwd, 'package.json'), rootManifest);
    writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n');
    run('git', ['init', '--initial-branch', readJson(join(cwd, '.changeset/config.json')).baseBranch]);
    run('git', ['add', '.']);
    run('git', [
        '-c',
        'user.name=Release fixture',
        '-c',
        'user.email=release@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        'commit',
        '-m',
        'Release fixture',
    ]);
    return { cwd, run, rootVersion: rootManifest.version };
}

const frozenInstall = ['install', '--lockfile-only', '--frozen-lockfile', '--offline', '--ignore-scripts'];

for (const [bump, version] of [
    ['patch', '1.2.4'],
    ['minor', '1.3.0'],
    ['major', '2.0.0'],
]) {
    test(`${bump} release preserves the summary, versions the SDK and refreshes the lockfile`, (t) => {
        const { cwd, run, rootVersion } = fixture(t);
        assert.match(run('pnpm', frozenInstall, 1), /ERR_PNPM_OUTDATED_LOCKFILE/);
        const summary = 'Release fixture: preserve "quotes", `code`, $values and 中文.\n\nExplain the migration.';
        run('pnpm', ['changeset', 'add', `--${bump}`, sdk, '--message', summary]);
        const changesets = readdirSync(join(cwd, '.changeset')).filter((file) => file.endsWith('.md'));
        assert.equal(changesets.length, 1);
        assert.ok(readFileSync(join(cwd, '.changeset', changesets[0]), 'utf8').includes(summary));
        run('pnpm', ['changeset', 'status', '--output', 'plan.json']);
        assert.deepEqual(
            readJson(join(cwd, 'plan.json')).releases.map(({ name, type, newVersion }) => ({ name, type, newVersion })),
            [{ name: sdk, type: bump, newVersion: version }]
        );
        // This is the composed command used in CI, including the actual pnpm lockfile refresh.
        run('pnpm', ['run', 'release:version']);
        assert.equal(readJson(join(cwd, packageFiles[1])).version, version);
        assert.equal(readJson(join(cwd, packageFiles[0])).version, rootVersion);
        assert.deepEqual(readdirSync(join(cwd, '.changeset')), ['config.json']);
        const changelog = 'packages/perpv3-ts/CHANGELOG.md';
        const content = readFileSync(join(cwd, changelog), 'utf8');
        assert.ok(content.includes(`# ${version}`));
        for (const paragraph of summary.split('\n\n')) assert.ok(content.includes(paragraph));
        run('pnpm', frozenInstall);

        // Empty releases must fail before the install step can repair another stale importer.
        const manifest = readJson(join(cwd, 'package.json'));
        delete manifest.devDependencies[sdk];
        writeJson(join(cwd, 'package.json'), manifest);
        const snapshot = () =>
            [...packageFiles, 'pnpm-lock.yaml', changelog].map((file) => readFileSync(join(cwd, file), 'utf8'));
        const before = snapshot();
        assert.match(run('pnpm', ['run', 'release:version'], 1), /No unreleased changesets found/);
        assert.deepEqual(snapshot(), before, 'Empty version command must not mutate release files');
        assert.match(run('pnpm', frozenInstall, 1), /ERR_PNPM_OUTDATED_LOCKFILE/);
    });
}

test('prepublishOnly rejects the local viem-kit override and allows removal of the override', (t) => {
    const { cwd, run } = fixture(t);
    const manifest = readJson(join(cwd, 'package.json'));
    manifest.pnpm = { overrides: { '@derivation-tech/viem-kit': 'file:./vendor/local-fixture.tgz' } };
    writeJson(join(cwd, 'package.json'), manifest);
    const check = ['-C', 'packages/perpv3-ts', 'run', 'prepublishOnly'];
    assert.match(run('pnpm', check, 1), /Replace the local viem-kit override/);
    delete manifest.pnpm.overrides['@derivation-tech/viem-kit'];
    writeJson(join(cwd, 'package.json'), manifest);
    run('pnpm', check);
});
