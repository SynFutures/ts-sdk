import type { ApiSigner, SignParams, SignResult } from '@synfutures/perpv3-ts/apis';

/**
 * this is a mock signer for the API examples
 */
export class ApiSign implements ApiSigner {
    constructor(private readonly nonce: string) {}

    sign(_params: SignParams): SignResult {
        // NOTE: This is a mock signature generation.
        // In a real-world scenario, you would use the params and a secret key to generate a valid signature.
        return {
            'X-Api-Nonce': this.nonce,
            'X-Api-Sign': 'you should generate a sign', // this.signer.sign(params)
            'X-Api-Ts': Date.now(),
        };
    }
}
