const { spawnSync } = require('node:child_process');
const { appendFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

function pnpmJson(args, allowOutdated = false) {
    const result = spawnSync('pnpm', args, { cwd: root, encoding: 'utf8', timeout: 120_000 });
    if (result.error) throw result.error;
    if (result.status !== 0 && !(allowOutdated && result.status === 1)) {
        throw new Error(`pnpm ${args[0]} failed (status ${result.status})`);
    }
    // Exit 1 can also mean a registry/network failure. Only accept a complete report.
    const value = JSON.parse(result.stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`pnpm ${args[0]} did not return a JSON object`);
    }
    if (result.status === 1 && Object.keys(value).length === 0) {
        throw new Error('pnpm outdated failed without reporting any updates');
    }
    return value;
}

async function main() {
    const outdated = pnpmJson(['outdated', '--recursive', '--include-github-actions', '--format', 'json'], true);
    const packageManager = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager;
    const pnpmTags = pnpmJson(['view', 'pnpm', 'dist-tags', '--json']);
    const pinnedNode = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
    const response = await fetch('https://nodejs.org/dist/index.json', { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Node release index failed: HTTP ${response.status}`);
    const releases = await response.json();
    const major = pinnedNode.replace(/^v/, '').split('.')[0];
    const currentMajor = releases.find((release) => release.version.startsWith(`v${major}.`));
    const latestLts = releases.find((release) => release.lts);
    if (!currentMajor || !latestLts || !releases[0]?.version) throw new Error('Incomplete Node release index');
    const report = {
        generatedAt: new Date().toISOString(),
        toolchain: {
            packageManager,
            pnpmRegistryTags: pnpmTags,
            node: {
                pinned: pinnedNode,
                latestInPinnedMajor: currentMajor.version,
                latestLts: latestLts.version,
                latest: releases[0].version,
            },
        },
        outdated,
    };
    const json = JSON.stringify(report, null, 2);
    console.log(json);
    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
            process.env.GITHUB_STEP_SUMMARY,
            `## Dependency update report\n\nReview candidates against the compatibility decisions in packages/perpv3-ts/docs/development.md. Registry tags are informational and may lag an explicitly pinned release.\n\n<pre>${json.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>\n`
        );
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
