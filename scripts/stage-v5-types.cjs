// The default host exposes the original contracts and provider types even in a read-only
// plugin. Ship their declarations without installing wallets or WebSocket implementations.
const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, join, relative, resolve, sep } = require('node:path');

module.exports = function stageV5Types(output, declarations) {
    const consumer = require(join(process.cwd(), 'package.json'));
    const resolveFromEthers = createRequire(require.resolve('ethers/package.json', { paths: [process.cwd()] }));
    const included = new Set();

    function rewrite(file, source) {
        return source.replace(
            /((?:from\s+|import\())(['"])(ethers|@ethersproject\/[a-z0-9-]+)(\/[^'"]+)?\2/g,
            (original, prefix, quote, name, subpath) => {
                if (consumer.dependencies[name]) return original;
                const target = stagePackage(name);
                const path = relative(dirname(file), join(target, subpath || ''))
                    .split(sep)
                    .join('/');
                return prefix + quote + (path.startsWith('.') ? path : './' + path) + quote;
            }
        );
    }

    function stagePackage(name) {
        const target = join(output, name);
        if (included.has(name)) return target;
        included.add(name);
        const manifest = resolveFromEthers.resolve(name + '/package.json');
        const root = dirname(manifest);
        const { version, types } = require(manifest);
        mkdirSync(join(target, 'lib'), { recursive: true });
        writeFileSync(join(target, 'package.json'), JSON.stringify({ name, version, types }));
        const license = join(root, 'LICENSE.md');
        copyFileSync(
            existsSync(license) ? license : resolveFromEthers.resolve('./LICENSE.md'),
            join(target, 'LICENSE.md')
        );
        for (const entry of readdirSync(join(root, 'lib'), { recursive: true })) {
            if (!entry.endsWith('.d.ts')) continue;
            const dest = join(target, 'lib', entry);
            mkdirSync(dirname(dest), { recursive: true });
            writeFileSync(dest, rewrite(dest, readFileSync(join(root, 'lib', entry), 'utf8')));
        }
        return target;
    }

    for (const file of declarations) {
        const path = resolve(file);
        writeFileSync(path, rewrite(path, readFileSync(path, 'utf8')));
    }
};
