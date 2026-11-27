const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const { test } = require('node:test');

const script = resolve(__dirname, '../configure-registry.cjs');

function configure(t, registry) {
    const directory = mkdtempSync(join(tmpdir(), 'perpv3-registry-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [script], {
        env: { RUNNER_TEMP: directory, NPM_REGISTRY_URL: registry, NODE_AUTH_TOKEN: 'fixture-token-never-written' },
        encoding: 'utf8',
        timeout: 10_000,
    });
    assert.ifError(result.error);
    return { result, file: join(directory, 'perpv3-registry.npmrc') };
}

for (const registry of ['https://registry.example.invalid', 'https://registry.example.invalid/repository/npm/']) {
    test(`registry config preserves both scopes and deferred authentication: ${registry}`, (t) => {
        const { result, file } = configure(t, registry);
        assert.equal(result.status, 0, result.stderr);
        const normalized = registry.endsWith('/') ? registry : `${registry}/`;
        const authPath = normalized.slice('https:'.length);
        assert.equal(
            readFileSync(file, 'utf8'),
            `@synfutures:registry=${normalized}\n@derivation-tech:registry=${normalized}\n${authPath}:_authToken=\${NODE_AUTH_TOKEN}\n`
        );
        assert.equal(statSync(file).mode & 0o777, 0o600);
        assert.equal(result.stdout, '');
        const config = spawnSync('pnpm', ['config', 'get', '@synfutures:registry', '--json'], {
            cwd: dirname(file),
            env: {
                PATH: process.env.PATH,
                HOME: dirname(file),
                pnpm_config_userconfig: file,
                NODE_AUTH_TOKEN: 'fixture-token-never-written',
            },
            encoding: 'utf8',
            timeout: 10_000,
        });
        assert.ifError(config.error);
        assert.equal(config.status, 0, config.stderr);
        assert.equal(JSON.parse(config.stdout), normalized);
    });
}

for (const registry of [
    '',
    'invalid',
    'file:///tmp/registry',
    'https://user:password@example.invalid',
    'https://example.invalid/?token=value',
    'https://example.invalid/#fragment',
]) {
    test(`registry config rejects invalid or credential-bearing input: ${registry}`, (t) => {
        const { result, file } = configure(t, registry);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /must be a valid registry URL|Expected a registry URL/);
        assert.equal(existsSync(file), false);
    });
}

test('a clean consumer installs the released kit through the authenticated scoped registry', async (t) => {
    const { createServer } = require('node:http');
    const { writeFileSync, mkdirSync } = require('node:fs');
    const { installConsumer } = await import('../../packages/perpv3-ts/scripts/install-consumer.mjs');
    const token = 'fixture-token-never-written';
    const name = '@derivation-tech/viem-kit';
    const version = '1.0.0';
    let archive;
    const requests = [];
    const server = createServer((req, res) => {
        requests.push(req.url);
        if (req.headers.authorization !== `Bearer ${token}`) return res.writeHead(401).end();
        if (req.url === '/kit.tgz') return res.end(archive);
        res.setHeader('Content-Type', 'application/json');
        res.end(
            JSON.stringify({
                name,
                'dist-tags': { latest: version },
                versions: {
                    [version]: { name, version, dist: { tarball: `${registry}/kit.tgz` } },
                },
            })
        );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const registry = `http://127.0.0.1:${server.address().port}`;
    const { file } = configure(t, registry);
    const dir = dirname(file);
    const pkg = join(dir, 'package');
    mkdirSync(pkg);
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name, version }));
    archive = spawnSync('tar', ['-czf', '-', 'package'], { cwd: dir }).stdout;
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: { [name]: version } }));
    await installConsumer(dir, { PATH: process.env.PATH, npm_config_cache: join(dir, 'cache') }, file, token);
    assert.ok(requests.includes('/kit.tgz'));
    assert.equal(JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'))).version, version);
});
