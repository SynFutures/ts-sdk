import type { Address, Erc20TokenInfo, PublicClient } from '@derivation-tech/viem-kit';

export interface ParserDeps {
    /**
     * Optional address resolver used to annotate addresses with friendly names.
     * Should return 'UNKNOWN' (or the address itself) when no mapping exists.
     */
    resolveAddress?: (address: Address) => string | Promise<string>;

    /**
     * Token metadata lookup used by parsers that need decimals/symbols.
     * Accepts either a token symbol or checksum address.
     */
    getTokenInfo?: (symbolOrAddress: string) => Promise<Erc20TokenInfo | undefined>;

    /**
     * Public client used for on-chain fallbacks (e.g. fetching token metadata when cache misses).
     */
    publicClient?: PublicClient;

    /**
     * Native token placeholder address for the current network (mirrors legacy behaviour).
     */
    nativeTokenAddress?: Address;
}

export type MaybePromise<T> = T | Promise<T>;
