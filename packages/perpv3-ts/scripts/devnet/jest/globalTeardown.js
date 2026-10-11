import { stopAnvil } from '../anvil.js';

export default async function globalTeardown() {
    try {
        await stopAnvil(globalThis.__perpv3Devnet);
    } finally {
        delete globalThis.__perpv3Devnet;
        delete process.env.PERPV3_DEVNET_RPC_URL;
    }
}
