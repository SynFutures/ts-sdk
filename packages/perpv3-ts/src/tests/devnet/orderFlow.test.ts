import type { Address, Hash } from 'viem';
import { createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { CURRENT_GATE_ABI, CURRENT_INSTRUMENT_ABI } from '../../index';
import {
    PERP_EXPIRY,
    PlaceInput,
    QuotationWithSize,
    Side,
    TradeInput,
    UserSetting,
    WAD,
    encodeCancelParam,
    encodeDepositParam,
    encodeFillParam,
    encodePlaceParam,
    encodeTradeParam,
    fetchOnchainContext,
    inquireByBaseSize,
} from '../../index';
import { abs } from '../../math';
import { createDevnetContext } from './devnet';

const ctx = createDevnetContext();

const defaultInstrument = ctx.manifest.defaults.instrument;
const defaultQuote = ctx.manifest.tokens.quotes[defaultInstrument.quoteSymbol];
if (!defaultQuote) {
    throw new Error(`Missing quote token info in manifest for ${defaultInstrument.quoteSymbol}`);
}

const INSTRUMENT_ADDRESS = defaultInstrument.address;
const EXPIRY = defaultInstrument.expiry;
const QUOTE_TOKEN = defaultQuote.address;
const QUOTE_UNIT = 10n ** BigInt(defaultQuote.decimals);

const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_LEVERAGE = 4n * WAD;

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
] as const;

function createUserWallet(addressIndex: number) {
    const account = mnemonicToAccount(ctx.preset.anvil.mnemonic, { addressIndex });
    return createWalletClient({ chain: ctx.chain, transport: http(ctx.manifest.rpcUrl), account });
}

function createUserSetting() {
    return new UserSetting(3600, DEFAULT_SLIPPAGE_BPS, DEFAULT_LEVERAGE);
}

async function waitForTx(hash: Hash) {
    await ctx.publicClient.waitForTransactionReceipt({ hash });
}

async function transferQuote(to: Address, amount: bigint) {
    const hash = await ctx.walletClients.admin.writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [to, amount],
    });
    await waitForTx(hash);
}

async function approveQuote(wallet: ReturnType<typeof createUserWallet>, spender: Address, amount: bigint) {
    const hash = await wallet.writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
    });
    await waitForTx(hash);
}

async function depositQuote(wallet: ReturnType<typeof createUserWallet>, amount: bigint) {
    const hash = await wallet.writeContract({
        address: ctx.manifest.contracts.gate,
        abi: CURRENT_GATE_ABI,
        functionName: 'deposit',
        args: [encodeDepositParam(QUOTE_TOKEN, amount)],
    });
    await waitForTx(hash);
}

describe('devnet instrument order flow (ported from v3-contracts hardhat Instrument/Helper tests)', () => {
    it('place → taker trade → maker fill (fully taken order)', async () => {
        const makerWallet = createUserWallet(3);
        const takerWallet = createUserWallet(4);

        const transferAmount = 50_000n * QUOTE_UNIT;
        const depositAmount = 10_000n * QUOTE_UNIT;

        await transferQuote(makerWallet.account.address, transferAmount);
        await transferQuote(takerWallet.account.address, transferAmount);

        await approveQuote(makerWallet, ctx.manifest.contracts.gate, transferAmount);
        await approveQuote(takerWallet, ctx.manifest.contracts.gate, transferAmount);

        await depositQuote(makerWallet, depositAmount);
        await depositQuote(takerWallet, depositAmount);

        const userSetting = createUserSetting();

        const makerBefore = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        expect(makerBefore.expiry).toBe(PERP_EXPIRY);
        expect(makerBefore.portfolio.orders.length).toBe(0);

        const orderTick = makerBefore.instrumentSetting.alignTickStrictlyAbove(makerBefore.amm.tick);

        let baseQuantity = WAD / 10n;
        let placeParam: ReturnType<PlaceInput['simulate']>[0] | undefined;

        for (let attempt = 0; attempt < 8; attempt += 1) {
            const placeInput = new PlaceInput(makerWallet.account.address, orderTick, baseQuantity, Side.SHORT);
            try {
                [placeParam] = placeInput.simulate(makerBefore, userSetting);
                break;
            } catch {
                baseQuantity *= 2n;
            }
        }

        if (!placeParam) {
            throw new Error('Unable to find a placeParam that passes simulation validation');
        }

        const placeHash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'place',
            args: [encodePlaceParam(placeParam)],
        });
        await waitForTx(placeHash);

        const makerAfterPlace = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        expect(makerAfterPlace.portfolio.orders.length).toBe(1);
        const makerOrder = makerAfterPlace.portfolio.orders[0];
        const makerTaken = makerAfterPlace.portfolio.ordersTaken[0] ?? 0n;
        expect(makerOrder.tick).toBe(orderTick);
        expect(makerTaken).toBe(0n);

        // Find a LONG trade size that crosses the order tick.
        const takerBefore = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, takerWallet.account.address);
        expect(takerBefore.portfolio.position.size).toBe(0n);

        let tradeBaseQuantity = abs(makerOrder.size) * 2n;
        let quotationWithSize: QuotationWithSize | undefined;

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const signedSize = tradeBaseQuantity; // LONG
            const quotation = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, signedSize, ctx.rpcConfig);
            const candidate = new QuotationWithSize(signedSize, quotation);
            if (quotation.postTick >= makerOrder.tick && candidate.tradeValue >= takerBefore.instrumentSetting.minTradeValue) {
                quotationWithSize = candidate;
                break;
            }
            tradeBaseQuantity *= 2n;
        }

        if (!quotationWithSize) {
            throw new Error('Unable to find a taker trade size that crosses the maker order tick');
        }

        const [tradeParam] = new TradeInput(takerWallet.account.address, tradeBaseQuantity, Side.LONG).simulate(
            takerBefore,
            quotationWithSize,
            userSetting
        );

        const tradeHash = await takerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(tradeParam)],
        });
        await waitForTx(tradeHash);

        const makerAfterTake = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        const afterOrder = makerAfterTake.portfolio.orders.find(
            (order) => order.tick === makerOrder.tick && order.nonce === makerOrder.nonce
        );
        expect(afterOrder).toBeDefined();

        const orderIndex = makerAfterTake.portfolio.orders.findIndex(
            (order) => order.tick === makerOrder.tick && order.nonce === makerOrder.nonce
        );
        const takenAfter = makerAfterTake.portfolio.ordersTaken[orderIndex] ?? 0n;
        expect(abs(takenAfter)).toBeGreaterThanOrEqual(abs(makerOrder.size));

        const fillHash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'fill',
            args: [encodeFillParam({ expiry: EXPIRY, target: makerWallet.account.address, tick: makerOrder.tick, nonce: makerOrder.nonce })],
        });
        await waitForTx(fillHash);

        const makerAfterFill = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        expect(makerAfterFill.portfolio.orders.length).toBe(0);
        expect(makerAfterFill.portfolio.position.size).toBe(makerOrder.size);
    });

    it('place → cancel removes the order', async () => {
        const makerWallet = createUserWallet(3);

        const transferAmount = 20_000n * QUOTE_UNIT;
        const depositAmount = 10_000n * QUOTE_UNIT;

        await transferQuote(makerWallet.account.address, transferAmount);
        await approveQuote(makerWallet, ctx.manifest.contracts.gate, transferAmount);
        await depositQuote(makerWallet, depositAmount);

        const userSetting = createUserSetting();

        const before = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        const orderTick = before.instrumentSetting.alignTickStrictlyAbove(before.amm.tick);

        const placeInput = new PlaceInput(makerWallet.account.address, orderTick, WAD / 5n, Side.SHORT);
        const [placeParam] = placeInput.simulate(before, userSetting);

        const placeHash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'place',
            args: [encodePlaceParam(placeParam)],
        });
        await waitForTx(placeHash);

        const afterPlace = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        expect(afterPlace.portfolio.orders.length).toBe(1);

        const cancelHash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'cancel',
            args: [
                encodeCancelParam({
                    expiry: EXPIRY,
                    ticks: [orderTick],
                    deadline: userSetting.getDeadline(),
                }),
            ],
        });
        await waitForTx(cancelHash);

        const afterCancel = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        expect(afterCancel.portfolio.orders.length).toBe(0);
    });
});

