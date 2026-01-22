import type { Address, Hash } from 'viem';
import { createTestClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import {
    AddInput,
    CEX_MARKET_ABI,
    CURRENT_GATE_ABI,
    CURRENT_INSTRUMENT_ABI,
    PERP_EXPIRY,
    PlaceInput,
    QuotationWithSize,
    Side,
    Status,
    TradeInput,
    UserSetting,
    WAD,
    encodeAddParam,
    encodeCancelParam,
    encodeDepositParam,
    encodeFillParam,
    encodePlaceParam,
    encodeTradeParam,
    fetchOnchainContext,
    inquireByBaseSize,
    tickToWad,
    wadToTick,
} from '../../index';
import { abs } from '../../math';
import { createDevnetContext } from './devnet';

const ctx = createDevnetContext();

const futuresInstrument = ctx.manifest.instruments.find((instrument) => instrument.expiry !== PERP_EXPIRY);
if (!futuresInstrument) {
    throw new Error('Missing dated futures instrument in devnet manifest. Run: pnpm -C packages/perpv3-ts run devnet:regen');
}

const INSTRUMENT_ADDRESS = futuresInstrument.address;
const EXPIRY = futuresInstrument.expiry;

const quoteInfo = ctx.manifest.tokens.quotes[futuresInstrument.quoteSymbol];
if (!quoteInfo) {
    throw new Error(`Missing quote token info in manifest for ${futuresInstrument.quoteSymbol}`);
}

const QUOTE_TOKEN = quoteInfo.address;
const QUOTE_UNIT = 10n ** BigInt(quoteInfo.decimals);

const QUOTE_SCALER = 10n ** BigInt(18 - quoteInfo.decimals);

const MARKET_ADDRESS = ctx.manifest.contracts.markets[futuresInstrument.marketType];
if (!MARKET_ADDRESS) {
    throw new Error(`Missing market address in manifest for marketType=${futuresInstrument.marketType}`);
}

const testClient = createTestClient({ chain: ctx.chain, mode: 'anvil', transport: http(ctx.manifest.rpcUrl) });

const SETTLING_DURATION_SECONDS = 30 * 60;

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

const MOCK_CHAINLINK_FEEDER_ABI = [
    {
        name: 'currentPrice',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'int256' }],
    },
    {
        name: 'setPriceRawRepresentation',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'newPriceRaw', type: 'int256' }],
        outputs: [],
    },
] as const;

function createUserWallet(addressIndex: number) {
    const account = mnemonicToAccount(ctx.preset.anvil.mnemonic, { addressIndex });
    return createWalletClient({ chain: ctx.chain, transport: http(ctx.manifest.rpcUrl), account });
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

async function approveQuote(wallet: ReturnType<typeof createUserWallet>, amount: bigint) {
    const hash = await wallet.writeContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ctx.manifest.contracts.gate, amount],
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

async function getQuoteBalance(address: Address): Promise<bigint> {
    return await ctx.publicClient.readContract({
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
    });
}

async function getVaultBalance(address: Address): Promise<bigint> {
    return await ctx.publicClient.readContract({
        address: ctx.manifest.contracts.gate,
        abi: CURRENT_GATE_ABI,
        functionName: 'reserveOf',
        args: [QUOTE_TOKEN, address],
    });
}

async function setSpotPrice(spotWad: bigint) {
    const [, scaler0, aggregator0, , scaler1, aggregator1] = await ctx.publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: CEX_MARKET_ABI,
        functionName: 'feeders',
        args: [INSTRUMENT_ADDRESS],
    });

    if (aggregator0 === '0x0000000000000000000000000000000000000000') {
        throw new Error('Market feeder aggregator0 is not set');
    }
    if (aggregator1 === '0x0000000000000000000000000000000000000000') {
        throw new Error('Market feeder aggregator1 is not set');
    }

    const answer1 = (await ctx.publicClient.readContract({
        address: aggregator1,
        abi: MOCK_CHAINLINK_FEEDER_ABI,
        functionName: 'currentPrice',
    })) as bigint;
    if (answer1 <= 0n) {
        throw new Error('Invalid aggregator1 price');
    }

    const price1 = answer1 * scaler1;
    const desiredPrice0 = (price1 * spotWad) / WAD;
    const desiredAnswer0 = desiredPrice0 / scaler0;

    const setPriceHash = await ctx.walletClients.admin.writeContract({
        address: aggregator0,
        abi: MOCK_CHAINLINK_FEEDER_ABI,
        functionName: 'setPriceRawRepresentation',
        args: [desiredAnswer0],
    });
    await waitForTx(setPriceHash);
}

type Rng = ReturnType<typeof createRng>;

function createRng(seed: number) {
    let state = seed >>> 0;
    if (state === 0) state = 1;

    const nextUint32 = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state;
    };

    const nextInt = (minInclusive: number, maxInclusive: number) => {
        if (maxInclusive < minInclusive) throw new Error('Invalid rng range');
        const span = maxInclusive - minInclusive + 1;
        return minInclusive + (nextUint32() % span);
    };

    const pick = <T>(items: readonly T[]): T => {
        if (items.length === 0) throw new Error('Cannot pick from empty array');
        return items[nextUint32() % items.length]!;
    };

    return { nextUint32, nextInt, pick };
}

function getSeed(): number {
    const raw = process.env.PERPV3_DEVNET_SEED ?? process.env.SEED ?? '1';
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid seed: ${raw}`);
    }
    return parsed;
}

async function executeTrade(
    rng: Rng,
    wallet: ReturnType<typeof createUserWallet>,
    userSetting: UserSetting
) {
    const before = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, wallet.account.address);

    const sizeCandidates = [
        WAD / 10n,
        WAD / 5n,
        WAD / 2n,
        WAD,
        2n * WAD,
    ] as const;

    const signedSize = rng.pick([1n, -1n]) * rng.pick(sizeCandidates);

    const side = signedSize > 0n ? Side.LONG : Side.SHORT;
    const baseQuantity = abs(signedSize);

    const quotation = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, signedSize, ctx.rpcConfig);
    const quotationWithSize = new QuotationWithSize(signedSize, quotation);

    const [tradeParam] = new TradeInput(wallet.account.address, baseQuantity, side).simulate(before, quotationWithSize, userSetting);
    const tradeHash = await wallet.writeContract({
        address: INSTRUMENT_ADDRESS,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'trade',
        args: [encodeTradeParam(tradeParam)],
    });
    await waitForTx(tradeHash);
}

describe('devnet dated futures integration (ported from v3-contracts hardhat integration.test.ts, excluding liquidate/sweep)', () => {
    it('random actions in futures (seeded) settles cleanly', async () => {
        const seed = getSeed();
        const rng = createRng(seed);

        const lpWallet = createUserWallet(3);
        const makerWallet = createUserWallet(4);
        const takerWallet = createUserWallet(5);
        const traderWallet = createUserWallet(6);

        const participants = [lpWallet, makerWallet, takerWallet, traderWallet];
        const participantAddresses = participants.map((wallet) => wallet.account.address);

        const transferAmount = 30_000n * QUOTE_UNIT;
        const depositAmount = 20_000n * QUOTE_UNIT;

        for (const wallet of participants) {
            await transferQuote(wallet.account.address, transferAmount);
            await approveQuote(wallet, transferAmount);
            await depositQuote(wallet, depositAmount);
        }

        const userSetting = new UserSetting(3600, 50, 4n * WAD);

        const initialAmm = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
        expect(initialAmm.amm.status).toBe(Status.TRADING);

        const initialTotal = await Promise.all(
            participantAddresses.map(async (addr) => {
                const [balance, reserve] = await Promise.all([getQuoteBalance(addr), getVaultBalance(addr)]);
                return balance + reserve;
            })
        ).then((parts) => parts.reduce((acc, value) => acc + value, 0n));
        const initialTotalWad = initialTotal * QUOTE_SCALER + initialAmm.amm.involvedFund;

        const tickLower = initialAmm.instrumentSetting.alignRangeTickLower(initialAmm.amm.tick - 5000);
        const tickUpper = initialAmm.instrumentSetting.alignRangeTickUpper(initialAmm.amm.tick + 5000);
        const addMarginWad = 10_000n * WAD;

        const [addParam] = new AddInput(lpWallet.account.address, addMarginWad, tickLower, tickUpper).simulate(initialAmm, userSetting);
        const addHash = await lpWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'add',
            args: [encodeAddParam(addParam)],
        });
        await waitForTx(addHash);

        for (let i = 0; i < rng.nextInt(1, 3); i += 1) {
            await executeTrade(rng, traderWallet, userSetting);
        }

        // Maker places a SHORT order slightly above current tick, taker LONG crosses it, maker fills.
        const makerBeforePlace = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        const orderTick = makerBeforePlace.instrumentSetting.alignTickStrictlyAbove(makerBeforePlace.amm.tick);

        let placeBaseQuantity = rng.pick([WAD / 10n, WAD / 5n, WAD / 2n, WAD] as const);
        let placeParam: ReturnType<PlaceInput['simulate']>[0] | undefined;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const placeInput = new PlaceInput(makerWallet.account.address, orderTick, placeBaseQuantity, Side.SHORT);
            try {
                [placeParam] = placeInput.simulate(makerBeforePlace, userSetting);
                break;
            } catch {
                placeBaseQuantity *= 2n;
            }
        }

        if (!placeParam) {
            throw new Error('Unable to find a valid placeParam for futures limit order');
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
        const makerOrder = makerAfterPlace.portfolio.orders[0]!;

        const takerBeforeTake = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, takerWallet.account.address);
        let takeBaseQuantity = abs(makerOrder.size) * 2n;
        let takeQuotationWithSize: QuotationWithSize | undefined;

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const signedSize = takeBaseQuantity; // LONG
            const quotation = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, signedSize, ctx.rpcConfig);
            const candidate = new QuotationWithSize(signedSize, quotation);
            if (quotation.postTick >= makerOrder.tick && candidate.tradeValue >= takerBeforeTake.instrumentSetting.minTradeValue) {
                takeQuotationWithSize = candidate;
                break;
            }
            takeBaseQuantity *= 2n;
        }

        if (!takeQuotationWithSize) {
            throw new Error('Unable to find a taker trade size that crosses the maker order tick (dated futures)');
        }

        const [takeTradeParam] = new TradeInput(takerWallet.account.address, takeBaseQuantity, Side.LONG).simulate(
            takerBeforeTake,
            takeQuotationWithSize,
            userSetting
        );
        const takeHash = await takerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(takeTradeParam)],
        });
        await waitForTx(takeHash);

        const makerAfterTake = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        const orderIndex = makerAfterTake.portfolio.orders.findIndex(
            (order) => order.tick === makerOrder.tick && order.nonce === makerOrder.nonce
        );
        expect(orderIndex).toBeGreaterThanOrEqual(0);
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

        // Place another order and cancel (ensure cancel works on dated futures expiry).
        const makerBeforeCancelPlace = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        const cancelTick = makerBeforeCancelPlace.instrumentSetting.alignTickStrictlyBelow(makerBeforeCancelPlace.amm.tick);
        const cancelPlaceInput = new PlaceInput(makerWallet.account.address, cancelTick, WAD / 5n, Side.LONG);
        const [cancelPlaceParam] = cancelPlaceInput.simulate(makerBeforeCancelPlace, userSetting);

        const cancelPlaceHash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'place',
            args: [encodePlaceParam(cancelPlaceParam)],
        });
        await waitForTx(cancelPlaceHash);

        const makerBeforeCancel = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        expect(makerBeforeCancel.portfolio.orders.length).toBe(1);

        const cancelHash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'cancel',
            args: [
                encodeCancelParam({
                    expiry: EXPIRY,
                    ticks: [cancelTick],
                    deadline: userSetting.getDeadline(makerBeforeCancel.blockInfo.timestamp),
                }),
            ],
        });
        await waitForTx(cancelHash);

        const makerAfterCancel = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        expect(makerAfterCancel.portfolio.orders.length).toBe(0);

        // Move into settling window and update.
        const settlingStart = EXPIRY - SETTLING_DURATION_SECONDS;
        const nowSnapshot = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        const toSettling = settlingStart - nowSnapshot.blockInfo.timestamp;
        if (toSettling <= 0) {
            throw new Error(
                `Unexpected expiry=${EXPIRY} before settlingStart=${settlingStart} (current timestamp=${nowSnapshot.blockInfo.timestamp})`
            );
        }

        await testClient.increaseTime({ seconds: toSettling });
        await waitForTx(
            await ctx.walletClients.admin.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'update',
                args: [EXPIRY],
            })
        );

        const settling = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        expect(settling.amm.status).toBe(Status.SETTLING);

        // Trade during SETTLING: close maker's position (if any).
        const makerDuringSettling = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
        if (makerDuringSettling.portfolio.position.size !== 0n) {
            const closeSignedSize = -makerDuringSettling.portfolio.position.size;
            // Align benchmark to mark tick to avoid deviation reverts during settling TWAP smoothing.
            const targetTick = wadToTick(makerDuringSettling.priceData.markPrice);
            await setSpotPrice(tickToWad(targetTick));

            const INT24_MIN = -(1 << 23);
            const INT24_MAX = (1 << 23) - 1;
            const closeParam = {
                expiry: EXPIRY,
                size: closeSignedSize,
                amount: 0n,
                limitTick: closeSignedSize > 0n ? INT24_MAX : INT24_MIN,
                deadline: 0,
            };
            const closeHash = await makerWallet.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'trade',
                args: [encodeTradeParam(closeParam)],
            });
            await waitForTx(closeHash);

            const makerAfterClose = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
            expect(makerAfterClose.portfolio.position.size).toBe(0n);
        }

        // Finalize settlement.
        await testClient.increaseTime({ seconds: SETTLING_DURATION_SECONDS + 1 });
        await waitForTx(
            await ctx.walletClients.admin.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'update',
                args: [EXPIRY],
            })
        );

        const settled = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        expect(settled.amm.status).toBe(Status.SETTLED);

        for (const target of participantAddresses) {
            await waitForTx(
                await ctx.walletClients.admin.writeContract({
                    address: INSTRUMENT_ADDRESS,
                    abi: CURRENT_INSTRUMENT_ABI,
                    functionName: 'settle',
                    args: [EXPIRY, target],
                })
            );
        }

        const after = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
        expect(after.amm.status).toBe(Status.SETTLED);

        for (const wallet of participants) {
            const snapshot = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, wallet.account.address);
            expect(snapshot.portfolio.position.size).toBe(0n);
            expect(snapshot.portfolio.orders.length).toBe(0);
            expect(snapshot.portfolio.ranges.length).toBe(0);
        }

        const finalTotal = await Promise.all(
            participantAddresses.map(async (addr) => {
                const [balance, reserve] = await Promise.all([getQuoteBalance(addr), getVaultBalance(addr)]);
                return balance + reserve;
            })
        ).then((parts) => parts.reduce((acc, value) => acc + value, 0n));

        const finalTotalWad = finalTotal * QUOTE_SCALER + after.amm.involvedFund;
        const diffWad = finalTotalWad >= initialTotalWad ? finalTotalWad - initialTotalWad : initialTotalWad - finalTotalWad;
        expect(diffWad).toBeLessThanOrEqual(200_000n * QUOTE_SCALER);
    });
});
