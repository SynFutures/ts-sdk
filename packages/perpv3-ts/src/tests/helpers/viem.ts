import type { PublicClient } from 'viem';

type MockPublicClientOverrides = {
    multicall: unknown;
    readContract: unknown;
};

export function mockPublicClient(overrides: MockPublicClientOverrides): PublicClient {
    return overrides as PublicClient;
}
