import type { SignedPermit } from './calldata/types';
import { getContract, type WalletClient, type Address } from 'viem';
import { ERC20_WITH_PERMIT_ABI } from '../abis';

/** Sign an ERC-2612 permit and return the same fields the encoder will submit. */
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
    deadline?: bigint; // in seconds, default to 1 hour from now
}): Promise<SignedPermit> {
    if (walletClient.account && walletClient.account.address.toLowerCase() !== ownerAddress.toLowerCase()) {
        throw new Error('Permit owner must match the signing account');
    }
    deadline ??= BigInt(Math.floor(Date.now() / 1000) + 3600);

    const erc20PermitContract = getContract({
        address: tokenAddress,
        abi: ERC20_WITH_PERMIT_ABI,

        client: walletClient,
    });

    const [nonce, name] = await Promise.all([
        erc20PermitContract.read.nonces([ownerAddress]),
        erc20PermitContract.read.name(),
    ]);

    // Create EIP-712 signature for permit
    const domain = {
        name,
        version: '1',
        chainId,
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
        nonce,
        deadline,
    };

    const signature = await walletClient.signTypedData({
        domain,
        types,
        message,
        primaryType: 'Permit',
        account: walletClient.account || ownerAddress,
    });

    return { ownerAddress, spenderAddress, tokenAddress, amount: approveAmount, deadline, signature };
}
