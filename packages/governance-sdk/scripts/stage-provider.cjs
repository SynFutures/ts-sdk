// Providers v5 pins ws to 8.18.0. Stage the two dispatch packages from the exact
// registry artifacts and keep the individual ethers modules and ws as regular,
// auditable dependencies. Their CommonJS code and browser mappings are preserved.
const { cpSync, readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { dirname, join, relative, sep } = require('node:path');

const names = ['ethers', '@ethersproject/providers'];

function linkV5(output, directory, specifier) {
    const target = relative(directory, join(output, 'v5', specifier))
        .split(sep)
        .join('/');
    return target.startsWith('.') ? target : './' + target;
}

function linkFiles(directory, output) {
    for (const name of readdirSync(directory, { recursive: true })) {
        if (!name.endsWith('.js') && !name.endsWith('.d.ts')) continue;
        const file = join(directory, name);
        const source = readFileSync(file, 'utf8');
        const linked = source.replace(
            /((?:from\s+|(?:require|import)\())(['"])(ethers(?:\/lib\/utils)?|@ethersproject\/providers)\2/g,
            (_, prefix, quote, specifier) => prefix + quote + linkV5(output, dirname(file), specifier) + quote
        );
        if (linked !== source) writeFileSync(file, linked);
    }
}

function stageProvider(output) {
    const deps = require('../package.json').dependencies;
    for (const name of names) {
        const origin = dirname(require.resolve(name + '/package.json'));
        const { version, types, main, browser, dependencies } = require(join(origin, 'package.json'));
        // Any newly introduced runtime dependency must be carried by the consumer.
        for (const dep of Object.keys(dependencies)) {
            if (!names.includes(dep) && !(dep in deps)) throw new Error('Missing v5 runtime dependency: ' + dep);
        }
        const dest = join(output, 'v5', name);
        cpSync(join(origin, 'lib'), join(dest, 'lib'), {
            recursive: true,
            filter: (file) => statSync(file).isDirectory() || file.endsWith('.js') || file.endsWith('.d.ts'),
        });
        cpSync(join(origin, 'LICENSE.md'), join(dest, 'LICENSE.md'));
        writeFileSync(join(dest, 'package.json'), JSON.stringify({ name, version, types, main, browser }));
    }
    linkFiles(join(output, 'v5'), output);
}

module.exports = { linkV5, linkFiles, stageProvider };
