import { getContract, WalletClient, Address, Hex, hexToNumber, isHex, padHex, toHex } from 'viem';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ERC20_WITH_PERMIT_ABI } from '../abis';

/**
 * Signs an ERC20 permit typed data for the given parameters.
 * use for send permit tx to approve spender to spend owner's token
 *
 * @param ownerAddress - The address of the token owner.
 * @param spenderAddress - The address of the spender.
 * @param tokenAddress - The address of the ERC20 token contract.
 * @param chainId - The ID of the blockchain network.
 * @param walletClient - The wallet client instance for signing the typed data.
 * @param approveAmount - The amount to approve for the spender.
 * @param deadline - The deadline for the permit signature (in seconds, default to 1 hour from now).
 * @returns signature - The signed ERC20 permit typed data.
 */
export async function signErc20PermitTypedData({
    ownerAddress,
    spenderAddress,
    tokenAddress,
    chainId,
    walletClient,
    approveAmount,
    deadline,
}: {
    ownerAddress: Address;
    spenderAddress: Address;
    tokenAddress: Address;
    chainId: number;
    walletClient: WalletClient;
    approveAmount: bigint;
    deadline?: number; // in seconds, default to 1 hour from now
}): Promise<Hex> {
    // Set default deadline (1 hour from now) if not provided
    deadline = deadline || Math.floor(Date.now() / 1000) + 3600;

    const erc20PermitContract = getContract({
        address: tokenAddress,
        abi: ERC20_WITH_PERMIT_ABI,

        client: walletClient,
    });

    const [currentNonceB, tokenNameStr] = await Promise.all([
        erc20PermitContract.read.nonces([ownerAddress]),
        erc20PermitContract.read.name(),
    ]);
    const currentNonce = currentNonceB as bigint;
    const tokenName = tokenNameStr as string;

    // Create EIP-712 signature for permit
    const domain = {
        name: tokenName,
        version: '1',
        chainId: chainId,
        verifyingContract: tokenAddress,
    };

    const types = {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ],
    };

    const message = {
        owner: ownerAddress,
        spender: spenderAddress,
        value: approveAmount,
        nonce: currentNonce,
        deadline: deadline,
    };

    const signature = await walletClient.signTypedData({
        domain,
        types,
        message: message,
        primaryType: 'Permit',
        account: walletClient.account || ownerAddress,
    });

    return signature;
}

/**
 * Split a signature string into its r, s, and v components.
 * replace with ethers.js with viem version
 * https://github.com/wevm/viem/discussions/458#discussioncomment-5842564
 *
 * @param signature The signature string to split.
 * @returns An object containing the r, s, and v components of the signature.
 */
export function splitSignature(signature: string): { r: Hex; s: Hex; v: number } {
    const signatureHex = isHex(signature) ? signature : toHex(signature);
    const sig = secp256k1.Signature.fromCompact(signatureHex.substring(2, 130));
    const v = hexToNumber(`0x${signatureHex.slice(130)}`);
    return { ...sig, v, r: padHex(toHex(sig.r), { size: 32 }), s: padHex(toHex(sig.s), { size: 32 }) };
}
