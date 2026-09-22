const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
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
