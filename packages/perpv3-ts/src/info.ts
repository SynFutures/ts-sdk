import type { Address } from 'viem';

import { Errors } from './types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface PerpInfo {
    readonly pearlSpacing: number;
    readonly orderSpacing: number;
    readonly rangeSpacing: number;
    readonly config: Address;
    readonly observer: Address;
    readonly gate: Address;
    readonly guardian?: Address;
}

// ============================================================================
// Network Configurations
// ============================================================================

const PerpInfoMap: Record<number, PerpInfo> = {
    8453: {
        // Base Mainnet
        pearlSpacing: 1,
        orderSpacing: 5,
        rangeSpacing: 50,
        config: '0xB63902d38738e353f3f52AdD203C418A0bFEa172',
        observer: '0x16Ae357dFe705D1B9862132Dca02e07150876e3E',
        gate: '0x208B443983D8BcC8578e9D86Db23FbA547071270',
        guardian: '0xBe0F37274AdADb32441acDB74791de159B0BD87E',
    },
    20250903: {
        // ABC Testnet
        pearlSpacing: 1,
        orderSpacing: 1,
        rangeSpacing: 50,
        config: '0xdfBA572929De47838BdE12336dfE8842B06d9628',
        observer: '0xEb8F6266Ab36A296fF8D092E45D2327511FB7bA6',
        gate: '0x22C05a9E9B2a0094e278153CED02B8617A0b00fE',
        guardian: '0x544d56774E7cD11CD1986Dc00831DB567B7Eabb9',
    },
    143: {
        // Monad Mainnet
        pearlSpacing: 1,
        orderSpacing: 1,
        rangeSpacing: 50,
        config: '0x15bC3C13cbf5903E78b97208ba1021E5dc1B4470',
        observer: '0x8301188F0a8E96a5e4f1A1CC84F41eBB9Fe8457d',
        gate: '0x2E32345Bf0592bFf19313831B99900C530D37d90',
        guardian: '0x5FE49fb8770A8009335B1d76496c3e07Ca04FC9F',
    },
    10143: {
        // Monad Testnet
        pearlSpacing: 1,
        orderSpacing: 1,
        rangeSpacing: 50,
        config: "0x0506087b6b9A514E924E8d262DF1D50f987635C0",
        observer: "0x486F01dbd17F3EF4A3C889Abca7E22c2f4498e3f",
        gate: "0xD016AEd1584f3Ec2A09c722797989F64dA605c7e",
        guardian: "0x206f0a544C3e0861f7D1AfBA02d627BA8fE2759c",
    },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get complete perp info for a given chain ID.
 * @throws {SynfError} if chainId is not supported
 */
export function getPerpInfo(chainId: number): PerpInfo {
    const perpInfo = PerpInfoMap[chainId];
    if (!perpInfo) {
        throw Errors.unsupportedChain(chainId);
    }
    return perpInfo;
}
