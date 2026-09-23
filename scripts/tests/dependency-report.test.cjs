const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { test } = require('node:test');

function report(outdated, nodeOk = true) {
    const script = join(__dirname, '../dependency-report.cjs');
    return spawnSync(
        process.execPath,
        [
            '-e',
            `const cp = require('node:child_process');
            cp.spawnSync = (_, args) => args[0] === 'outdated'
                ? ${JSON.stringify(outdated)}
                : { status: 0, stdout: '{"latest":"12.6.0"}' };
            globalThis.fetch = async () => ({ ok: ${nodeOk}, status: 503,
                json: async () => [{ version: 'v26.0.0', lts: false }, { version: 'v24.21.0', lts: 'Krypton' }] });
            require(${JSON.stringify(script)});`,
        ],
        { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } }
    );
}

test('updates are informational while pnpm and Node pins remain visible', () => {
    const result = report({ status: 1, stdout: '{"typescript":{"latest":"7.0.2"}}' });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.outdated.typescript.latest, '7.0.2');
    assert.match(data.toolchain.packageManager, /^pnpm@/);
    assert.equal(data.toolchain.node.latestInPinnedMajor, 'v24.21.0');
});

test('an up-to-date workspace still reports the toolchain', () => {
    const result = report({ status: 0, stdout: '{}' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).outdated, {});
});

test('registry failures are not mistaken for available updates', () => {
    for (const stdout of ['', '{}', 'null', '[]', 'registry unavailable']) {
        const result = report({ status: 1, stdout });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, '');
    }
});

test('Node metadata failures fail the report instead of claiming complete coverage', () => {
    const result = report({ status: 0, stdout: '{}' }, false);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Node release index failed: HTTP 503/);
});
