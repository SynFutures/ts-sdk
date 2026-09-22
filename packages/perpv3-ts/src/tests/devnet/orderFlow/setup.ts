import type { Address, Hash } from 'viem';
import { createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { CURRENT_GATE_ABI, UserSetting, WAD, encodeDepositParam } from '../../../index';
import { createDevnetContext } from '../devnet';

export const ctx = createDevnetContext();

const defaultInstrument = ctx.manifest.defaults.instrument;
const defaultQuote = ctx.manifest.tokens.quotes[defaultInstrument.quoteSymbol];
if (!defaultQuote) {
    throw new Error(`Missing quote token info in manifest for ${defaultInstrument.quoteSymbol}`);
}

export const INSTRUMENT_ADDRESS = defaultInstrument.address;
export const EXPIRY = defaultInstrument.expiry;
export const QUOTE_UNIT = 10n ** BigInt(defaultQuote.decimals);
export const QUOTE_SCALER = 10n ** BigInt(18 - defaultQuote.decimals);

export const DEFAULT_SLIPPAGE_BPS = 50;
export const DEFAULT_LEVERAGE = 4n * WAD;

const QUOTE_TOKEN = defaultQuote.address;

const ERC20_ABI = [
    {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
    },
] as const;

export function createUserWallet(addressIndex: number) {
    const account = mnemonicToAccount(ctx.preset.anvil.mnemonic, { addressIndex });
    return createWalletClient({ chain: ctx.chain, transport: http(ctx.manifest.rpcUrl), account });
}

export function createUserSetting() {
    return new UserSetting(3600, DEFAULT_SLIPPAGE_BPS, DEFAULT_LEVERAGE);
}

export async function waitForTx(hash: Hash) {
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
        throw new Error(`Transaction reverted (hash=${hash})`);
    }
}

export async function transferQuote(to: Address, amount: bigint) {
    const hash = await ctx.walletClients.admin.writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [to, amount],
    });
    await waitForTx(hash);
}

export async function approveQuote(wallet: ReturnType<typeof createUserWallet>, spender: Address, amount: bigint) {
    const hash = await wallet.writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
    });
    await waitForTx(hash);
}

export async function depositQuote(wallet: ReturnType<typeof createUserWallet>, amount: bigint) {
    const hash = await wallet.writeContract({
        address: ctx.manifest.contracts.gate,
        abi: CURRENT_GATE_ABI,
        functionName: 'deposit',
        args: [encodeDepositParam(QUOTE_TOKEN, amount)],
    });
    await waitForTx(hash);
}

export async function getQuoteBalance(address: Address): Promise<bigint> {
    return await ctx.publicClient.readContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
    });
}
