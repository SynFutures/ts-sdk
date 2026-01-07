import { assertStateFresh, getDevnetPaths, computeExpectedStateMeta } from './devnet-meta.js';

function main() {
    const args = process.argv.slice(2);
    const jsonOutput = args.includes('--json');

    const paths = getDevnetPaths();
    const expected = computeExpectedStateMeta();

    try {
        const { existing } = assertStateFresh();
        if (jsonOutput) {
            process.stdout.write(JSON.stringify({ ok: true, paths, expected, existing }, null, 2));
        } else {
            process.stdout.write(`OK: devnet snapshot is fresh (cacheKey=${expected.cacheKey})\n`);
        }
        process.exit(0);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (jsonOutput) {
            process.stdout.write(JSON.stringify({ ok: false, paths, expected, error: message }, null, 2));
        } else {
            process.stderr.write(`${message}\n`);
        }
        process.exit(1);
    }
}

main();

