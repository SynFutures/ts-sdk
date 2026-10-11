import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { log } from 'node:console';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const cache = join(root, 'node_modules/.cache');
mkdirSync(cache, { recursive: true });
const temporary = mkdtempSync(join(cache, 'docs-'));
const documents = [
    'README.md',
    ...readdirSync(join(root, 'docs'))
        .filter((name) => name.endsWith('.md'))
        .map((name) => `docs/${name}`),
];
try {
    let count = 0;
    for (const document of documents) {
        const text = readFileSync(join(root, document), 'utf8');
        for (const match of text.matchAll(/```(?:typescript|ts)\n([\s\S]*?)```/g)) {
            writeFileSync(
                join(temporary, `${document.replaceAll('/', '-').replace('.md', '')}-${count++}.ts`),
                match[1]
            );
        }
    }
    writeFileSync(
        join(temporary, 'tsconfig.json'),
        JSON.stringify({
            extends: join(root, 'tsconfig.json'),
            compilerOptions: {
                rootDir: root,
                paths: {
                    '@synfutures/perpv3-ts': [join(root, 'src/index.ts')],
                    '@synfutures/perpv3-ts/*': [join(root, 'src/*')],
                },
            },
            include: ['./*.ts'],
            exclude: [],
        })
    );
    execFileSync(
        process.execPath,
        [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', join(temporary, 'tsconfig.json')],
        { stdio: 'inherit' }
    );
    log(`Checked ${count} TypeScript documentation examples`);
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
