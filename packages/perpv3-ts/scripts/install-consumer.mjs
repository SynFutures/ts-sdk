import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function installConsumer(cwd, env, userconfig, token) {
    await promisify(execFile)('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
        cwd,
        env: {
            ...env,
            NPM_CONFIG_USERCONFIG: userconfig || '/dev/null',
            ...(userconfig && token && { NODE_AUTH_TOKEN: token }),
        },
    });
}
