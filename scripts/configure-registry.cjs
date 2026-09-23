const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

let registry;
try {
    registry = new URL(process.env.NPM_REGISTRY_URL);
} catch {
    throw new Error('NPM_REGISTRY_URL must be a valid registry URL');
}
if (
    !['http:', 'https:'].includes(registry.protocol) ||
    registry.username ||
    registry.password ||
    registry.search ||
    registry.hash
) {
    throw new Error('Expected a registry URL without credentials, query or fragment');
}
if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP must be set');
registry.pathname = registry.pathname.replace(/\/?$/, '/');
// Workflows share this scope mapping; the token is resolved only in authenticated steps.
const content = `@synfutures:registry=${registry.href}\n@derivation-tech:registry=${registry.href}\n//${registry.host}${registry.pathname}:_authToken=\${NODE_AUTH_TOKEN}\n`;
writeFileSync(join(process.env.RUNNER_TEMP, 'perpv3-registry.npmrc'), content, { mode: 0o600 });
