import type { Address, Hash } from 'viem';
import { createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { CURRENT_GATE_ABI, CURRENT_INSTRUMENT_ABI } from '../../index';
	import {
	    AddInput,
	    PERP_EXPIRY,
	    PlaceInput,
	    QuotationWithSize,
	    RemoveInput,
	    Side,
	    TradeInput,
	    UserSetting,
	    WAD,
	    encodeAddParam,
	    encodeCancelParam,
	    encodeDepositParam,
	    encodeFillParam,
	    encodePlaceParam,
	    encodeRemoveParam,
	    encodeTradeParam,
	    fetchOnchainContext,
	    inquireByBaseSize,
	    inquireByTick,
	} from '../../index';
	import { abs } from '../../math';
	import { Range } from '../../types';
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
	const QUOTE_SCALER = 10n ** BigInt(18 - defaultQuote.decimals);

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
	    {
	        name: 'balanceOf',
	        type: 'function',
	        stateMutability: 'view',
	        inputs: [{ name: 'account', type: 'address' }],
	        outputs: [{ type: 'uint256' }],
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
	
	async function getQuoteBalance(address: Address): Promise<bigint> {
	    return await ctx.publicClient.readContract({
	        address: QUOTE_TOKEN,
	        abi: ERC20_ABI,
	        functionName: 'balanceOf',
	        args: [address],
	    });
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
                    deadline: userSetting.getDeadline(afterPlace.blockInfo.timestamp),
                }),
            ],
        });
        await waitForTx(cancelHash);

	        const afterCancel = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, makerWallet.account.address);
	        expect(afterCancel.portfolio.orders.length).toBe(0);
	    });
	
	    it('two users can add/remove liquidity at the same tick range', async () => {
	        const traderWallet = createUserWallet(4);
	        const lpWallet = createUserWallet(3);
	
	        const transferAmount = 200_000n * QUOTE_UNIT;
	
	        await transferQuote(traderWallet.account.address, transferAmount);
	        await transferQuote(lpWallet.account.address, transferAmount);
	
	        await approveQuote(traderWallet, ctx.manifest.contracts.gate, transferAmount);
	        await approveQuote(lpWallet, ctx.manifest.contracts.gate, transferAmount);
	
	        const traderBeforeAdd = await fetchOnchainContext(
	            INSTRUMENT_ADDRESS,
	            EXPIRY,
	            ctx.rpcConfig,
	            traderWallet.account.address
	        );
	
	        const leverage =
	            traderBeforeAdd.instrumentSetting.maxLeverage < DEFAULT_LEVERAGE
	                ? traderBeforeAdd.instrumentSetting.maxLeverage
	                : DEFAULT_LEVERAGE;
	        const userSetting = new UserSetting(3600, DEFAULT_SLIPPAGE_BPS, leverage);
	
	        const { tick: ammTick } = traderBeforeAdd.amm;
	        const delta = traderBeforeAdd.instrumentSetting.minTickDelta;
	        const tickLower = traderBeforeAdd.instrumentSetting.alignRangeTickLower(ammTick - delta);
	        const tickUpper = traderBeforeAdd.instrumentSetting.alignRangeTickUpper(ammTick + delta);
	
	        let addMargin = 5_000n * WAD;
	        let traderAddParam: ReturnType<AddInput['simulate']>[0] | undefined;
	
	        for (let attempt = 0; attempt < 8; attempt += 1) {
	            try {
	                [traderAddParam] = new AddInput(traderWallet.account.address, addMargin, tickLower, tickUpper).simulate(
	                    traderBeforeAdd,
	                    userSetting
	                );
	                break;
	            } catch {
	                addMargin *= 2n;
	            }
	        }
	
	        if (!traderAddParam) {
	            throw new Error('Unable to find a valid addParam for trader');
	        }
	
	        const traderDepositAmount = traderAddParam.amount / QUOTE_SCALER + 1n;
	        await depositQuote(traderWallet, traderDepositAmount);
	
	        const traderAddHash = await traderWallet.writeContract({
	            address: INSTRUMENT_ADDRESS,
	            abi: CURRENT_INSTRUMENT_ABI,
	            functionName: 'add',
	            args: [encodeAddParam(traderAddParam)],
	        });
	        await waitForTx(traderAddHash);
	
	        const lpBeforeAdd = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
	
	        let lpAddParam: ReturnType<AddInput['simulate']>[0] | undefined;
	        for (let attempt = 0; attempt < 8; attempt += 1) {
	            try {
	                [lpAddParam] = new AddInput(lpWallet.account.address, addMargin, tickLower, tickUpper).simulate(
	                    lpBeforeAdd,
	                    userSetting
	                );
	                break;
	            } catch {
	                addMargin *= 2n;
	            }
	        }
	
	        if (!lpAddParam) {
	            throw new Error('Unable to find a valid addParam for lp');
	        }
	
	        const lpDepositAmount = lpAddParam.amount / QUOTE_SCALER + 1n;
	        await depositQuote(lpWallet, lpDepositAmount);
	
	        const lpAddHash = await lpWallet.writeContract({
	            address: INSTRUMENT_ADDRESS,
	            abi: CURRENT_INSTRUMENT_ABI,
	            functionName: 'add',
	            args: [encodeAddParam(lpAddParam)],
	        });
	        await waitForTx(lpAddHash);
	
	        const traderAfterAdd = await fetchOnchainContext(
	            INSTRUMENT_ADDRESS,
	            EXPIRY,
	            ctx.rpcConfig,
	            traderWallet.account.address
	        );
	        const lpAfterAdd = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
	
	        expect(traderAfterAdd.portfolio.ranges.length).toBe(1);
	        expect(traderAfterAdd.portfolio.rids.length).toBe(1);
	        expect(lpAfterAdd.portfolio.ranges.length).toBe(1);
	        expect(lpAfterAdd.portfolio.rids.length).toBe(1);
	
	        const traderRid = traderAfterAdd.portfolio.rids[0];
	        const lpRid = lpAfterAdd.portfolio.rids[0];
	        if (!traderRid || !lpRid) throw new Error('Missing range rid after add');
	        expect(traderRid).toBe(lpRid);
	
	        const { tickLower: addedLower, tickUpper: addedUpper } = Range.unpackKey(traderRid);
	        expect(addedLower).toBe(tickLower);
	        expect(addedUpper).toBe(tickUpper);
	
	        const [traderRemoveParam] = new RemoveInput(traderWallet.account.address, tickLower, tickUpper).simulate(
	            traderAfterAdd,
	            userSetting
	        );
	        const traderRemoveHash = await traderWallet.writeContract({
	            address: INSTRUMENT_ADDRESS,
	            abi: CURRENT_INSTRUMENT_ABI,
	            functionName: 'remove',
	            args: [encodeRemoveParam(traderRemoveParam)],
	        });
	        await waitForTx(traderRemoveHash);
	
	        const traderAfterRemove = await fetchOnchainContext(
	            INSTRUMENT_ADDRESS,
	            EXPIRY,
	            ctx.rpcConfig,
	            traderWallet.account.address
	        );
	        expect(traderAfterRemove.portfolio.ranges.length).toBe(0);
	
	        const [lpRemoveParam] = new RemoveInput(lpWallet.account.address, tickLower, tickUpper).simulate(lpAfterAdd, userSetting);
	        const lpRemoveHash = await lpWallet.writeContract({
	            address: INSTRUMENT_ADDRESS,
	            abi: CURRENT_INSTRUMENT_ABI,
	            functionName: 'remove',
	            args: [encodeRemoveParam(lpRemoveParam)],
	        });
	        await waitForTx(lpRemoveHash);
	
	        const lpAfterRemove = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
	        expect(lpAfterRemove.portfolio.ranges.length).toBe(0);
	    });

	    it('multiple users can place orders at the same tick', async () => {
	        const trader0Wallet = createUserWallet(4);
        const trader1Wallet = createUserWallet(5);
        const lpWallet = createUserWallet(3);

        const transferAmount = 50_000n * QUOTE_UNIT;
        const depositAmount = 20_000n * QUOTE_UNIT;

        await transferQuote(trader0Wallet.account.address, transferAmount);
        await transferQuote(trader1Wallet.account.address, transferAmount);
        await transferQuote(lpWallet.account.address, transferAmount);

        await approveQuote(trader0Wallet, ctx.manifest.contracts.gate, transferAmount);
        await approveQuote(trader1Wallet, ctx.manifest.contracts.gate, transferAmount);
        await approveQuote(lpWallet, ctx.manifest.contracts.gate, transferAmount);

        await depositQuote(trader0Wallet, depositAmount);
        await depositQuote(trader1Wallet, depositAmount);
        await depositQuote(lpWallet, depositAmount);

        const trader0Before = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            trader0Wallet.account.address
        );

        const feasible = trader0Before.instrumentSetting.getFeasibleLimitOrderTickRange(
            Side.SHORT,
            trader0Before.amm.tick,
            trader0Before.priceData.markPrice
        );
        if (!feasible) {
            throw new Error('No feasible tick range for SHORT limit orders');
        }

        const orderTick1 = feasible.minTick;
        const orderTick2 = orderTick1 + trader0Before.instrumentSetting.orderSpacing;
        if (orderTick2 > feasible.maxTick) {
            throw new Error('Feasible tick range too narrow for placing orders at two different ticks');
        }

        const leverage =
            trader0Before.instrumentSetting.maxLeverage < 10n * WAD ? trader0Before.instrumentSetting.maxLeverage : 10n * WAD;
        const userSetting = new UserSetting(3600, DEFAULT_SLIPPAGE_BPS, leverage);

        const placeShortOrder = async (wallet: ReturnType<typeof createUserWallet>, tick: number) => {
            const before = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, wallet.account.address);

            let baseQuantity = WAD / 5n;
            let placeParam: ReturnType<PlaceInput['simulate']>[0] | undefined;

            for (let attempt = 0; attempt < 8; attempt += 1) {
                try {
                    [placeParam] = new PlaceInput(wallet.account.address, tick, baseQuantity, Side.SHORT).simulate(
                        before,
                        userSetting
                    );
                    break;
                } catch {
                    baseQuantity *= 2n;
                }
            }

            if (!placeParam) {
                throw new Error(`Unable to find a placeParam that passes simulation validation for tick=${tick}`);
            }

            const placeHash = await wallet.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'place',
                args: [encodePlaceParam(placeParam)],
            });
            await waitForTx(placeHash);
        };

        await placeShortOrder(trader0Wallet, orderTick1);
        await placeShortOrder(trader0Wallet, orderTick2);
        await placeShortOrder(trader1Wallet, orderTick1);
        await placeShortOrder(lpWallet, orderTick1);

        const trader0After = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            trader0Wallet.account.address
        );
        expect(trader0After.portfolio.orders.length).toBe(2);

        const trader1After = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            trader1Wallet.account.address
        );
        expect(trader1After.portfolio.orders.length).toBe(1);

        const lpAfter = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
        expect(lpAfter.portfolio.orders.length).toBe(1);

        const findOrderAtTick = (snapshot: Awaited<ReturnType<typeof fetchOnchainContext>>, tick: number) => {
            const index = snapshot.portfolio.orders.findIndex((order) => order.tick === tick);
            if (index < 0) throw new Error(`Missing order at tick=${tick}`);
            return { order: snapshot.portfolio.orders[index], taken: snapshot.portfolio.ordersTaken[index] ?? 0n };
        };

        const trader0Order1 = findOrderAtTick(trader0After, orderTick1);
        const trader0Order2 = findOrderAtTick(trader0After, orderTick2);
        const trader1Order1 = findOrderAtTick(trader1After, orderTick1);
        const lpOrder1 = findOrderAtTick(lpAfter, orderTick1);

        expect(trader0Order1.order.nonce).toBe(trader1Order1.order.nonce);
        expect(trader1Order1.order.nonce).toBe(lpOrder1.order.nonce);

        expect(trader0Order1.taken).toBe(0n);
        expect(trader0Order2.taken).toBe(0n);
        expect(trader1Order1.taken).toBe(0n);
        expect(lpOrder1.taken).toBe(0n);

        expect(trader0Order1.order.size < 0n).toBe(true);
        expect(trader0Order2.order.size < 0n).toBe(true);
	        expect(trader1Order1.order.size < 0n).toBe(true);
	        expect(lpOrder1.order.size < 0n).toBe(true);
	    });
	
	    it('trade can pull margin from EOA when reserve is empty with multiple ranges', async () => {
	        const lpWallet = createUserWallet(8);
	        const traderWallet = createUserWallet(9);
	
	        const transferAmount = 200_000n * QUOTE_UNIT;
	        await transferQuote(lpWallet.account.address, transferAmount);
	        await transferQuote(traderWallet.account.address, transferAmount);
	
	        await approveQuote(lpWallet, ctx.manifest.contracts.gate, transferAmount);
	        await approveQuote(traderWallet, ctx.manifest.contracts.gate, transferAmount);
	
	        const lpBefore = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
	        const { instrumentSetting } = lpBefore;
	
	        const leverage = instrumentSetting.maxLeverage < 5n * WAD ? instrumentSetting.maxLeverage : 5n * WAD;
	        const userSetting = new UserSetting(3600, 5000, leverage);
	
	        const delta = instrumentSetting.minTickDelta;
	        const narrowLower = instrumentSetting.alignRangeTickLower(lpBefore.amm.tick - delta);
	        const narrowUpper = instrumentSetting.alignRangeTickUpper(lpBefore.amm.tick + delta);
	
	        // Ported from v3-contracts hardhat `Instrument.test.ts`:
	        // second range uses the contract's `TICK_DELTA_MAX` (1.0001 ** 16096 ≈ 5.0).
	        const MAX_RANGE_TICK_DELTA = 16_096;
	        // We subtract `rangeSpacing` so the alignment rounding cannot push the final delta above `TICK_DELTA_MAX`.
	        const wideDelta = MAX_RANGE_TICK_DELTA - instrumentSetting.rangeSpacing;
	        const wideLower = instrumentSetting.alignRangeTickLower(lpBefore.amm.tick - wideDelta);
	        const wideUpper = instrumentSetting.alignRangeTickUpper(lpBefore.amm.tick + wideDelta);
	
	        let lpMargin = 10_000n * WAD;
	
	        const addLiquidity = async (snapshot: Awaited<ReturnType<typeof fetchOnchainContext>>, tickLower: number, tickUpper: number) => {
	            let addParam: ReturnType<AddInput['simulate']>[0] | undefined;
	            for (let attempt = 0; attempt < 8; attempt += 1) {
	                try {
	                    [addParam] = new AddInput(lpWallet.account.address, lpMargin, tickLower, tickUpper).simulate(
	                        snapshot,
	                        userSetting
	                    );
	                    break;
	                } catch {
	                    lpMargin *= 2n;
	                }
	            }
	
	            if (!addParam) {
	                throw new Error(`Unable to add liquidity for tickLower=${tickLower}, tickUpper=${tickUpper}`);
	            }
	
	            const depositAmount = addParam.amount / QUOTE_SCALER + 1n;
	            await depositQuote(lpWallet, depositAmount);
	
	            const addHash = await lpWallet.writeContract({
	                address: INSTRUMENT_ADDRESS,
	                abi: CURRENT_INSTRUMENT_ABI,
	                functionName: 'add',
	                args: [encodeAddParam(addParam)],
	            });
	            await waitForTx(addHash);
	        };
	
	        await addLiquidity(lpBefore, narrowLower, narrowUpper);
	        const lpAfterNarrow = await fetchOnchainContext(
	            INSTRUMENT_ADDRESS,
	            EXPIRY,
	            ctx.rpcConfig,
	            lpWallet.account.address
	        );
	        await addLiquidity(lpAfterNarrow, wideLower, wideUpper);
	
	        const lpAfterAdds = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, lpWallet.account.address);
	        expect(lpAfterAdds.portfolio.ranges.length).toBe(2);
	
	        let expectedPositionSize = 0n;
	
	        const tradeOnce = async (tradeBaseQuantity: bigint, useReserve: boolean) => {
	            const before = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
	            const quotationRaw = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, tradeBaseQuantity, ctx.rpcConfig);
	            const quotation = new QuotationWithSize(tradeBaseQuantity, quotationRaw);
	
	            const [tradeParam] = new TradeInput(traderWallet.account.address, tradeBaseQuantity, Side.LONG).simulate(
	                before,
	                quotation,
	                userSetting
	            );
	
	            const balanceBefore = await getQuoteBalance(traderWallet.account.address);
	            const reserveBefore = before.quoteState.reserve;
	
	            if (useReserve) {
	                const depositAmount = tradeParam.amount / QUOTE_SCALER + 1n;
	                await depositQuote(traderWallet, depositAmount);
	            } else {
	                expect(reserveBefore).toBe(0n);
	            }
	
	            const afterDepositBalance = await getQuoteBalance(traderWallet.account.address);
	            const afterDepositSnapshot = await fetchOnchainContext(
	                INSTRUMENT_ADDRESS,
	                EXPIRY,
	                ctx.rpcConfig,
	                traderWallet.account.address
	            );
	
	            const tradeHash = await traderWallet.writeContract({
	                address: INSTRUMENT_ADDRESS,
	                abi: CURRENT_INSTRUMENT_ABI,
	                functionName: 'trade',
	                args: [encodeTradeParam(tradeParam)],
	            });
	            await waitForTx(tradeHash);
	
	            expectedPositionSize += tradeParam.size;
	
	            const after = await fetchOnchainContext(INSTRUMENT_ADDRESS, EXPIRY, ctx.rpcConfig, traderWallet.account.address);
	            expect(after.portfolio.position.size).toBe(expectedPositionSize);
	
	            const balanceAfter = await getQuoteBalance(traderWallet.account.address);
	            if (useReserve) {
	                expect(balanceAfter).toBe(afterDepositBalance);
	                expect(after.quoteState.reserve < afterDepositSnapshot.quoteState.reserve).toBe(true);
	            } else {
	                expect(after.quoteState.reserve).toBe(0n);
	                expect(balanceAfter < balanceBefore).toBe(true);
	            }
	        };
	
	        const traderBeforeFirst = await fetchOnchainContext(
	            INSTRUMENT_ADDRESS,
	            EXPIRY,
	            ctx.rpcConfig,
	            traderWallet.account.address
	        );
	        const minTradeValue = traderBeforeFirst.instrumentSetting.minTradeValue;
	
	        let baseQuantity = WAD / 20n;
	        for (let attempt = 0; attempt < 8; attempt += 1) {
	            const quotation = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, baseQuantity, ctx.rpcConfig);
	            const candidate = new QuotationWithSize(baseQuantity, quotation);
	            if (candidate.tradeValue >= minTradeValue) {
	                break;
	            }
	            baseQuantity *= 2n;
	        }
	
	        await tradeOnce(baseQuantity, false);
	        await tradeOnce(baseQuantity, true);
	
	        // The Hardhat suite labels a final "trade in 2 ranges" here; in devnet we keep the
	        // key SDK invariant: trades succeed with multiple ranges present, and margin can be
	        // supplied either from EOA (no reserve) or from the Gate reserve.
	    });

    it('multi orders → taker trades cross orders → maker fill & cancel', async () => {
        const makerWallet = createUserWallet(5);
        const takerWallet = createUserWallet(4);

        const transferAmount = 100_000n * QUOTE_UNIT;
        const depositAmount = 30_000n * QUOTE_UNIT;

        await transferQuote(makerWallet.account.address, transferAmount);
        await transferQuote(takerWallet.account.address, transferAmount);

        await approveQuote(makerWallet, ctx.manifest.contracts.gate, transferAmount);
        await approveQuote(takerWallet, ctx.manifest.contracts.gate, transferAmount);

        await depositQuote(makerWallet, depositAmount);
        await depositQuote(takerWallet, depositAmount);

        // Mirrors the Hardhat test that opens a position before running cross-order trades,
        // so subsequent taker trades are not constrained by minTradeValue checks.
        const userSetting = new UserSetting(3600, 5000, 5n * WAD);

        const takerBeforeOpen = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            takerWallet.account.address
        );

        let openBaseQuantity = WAD / 20n;
        let openQuotationWithSize: QuotationWithSize | undefined;

        for (let attempt = 0; attempt < 8; attempt += 1) {
            const signedSize = openBaseQuantity; // LONG
            const quotation = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, signedSize, ctx.rpcConfig);
            const candidate = new QuotationWithSize(signedSize, quotation);
            if (candidate.tradeValue >= takerBeforeOpen.instrumentSetting.minTradeValue) {
                openQuotationWithSize = candidate;
                break;
            }
            openBaseQuantity *= 2n;
        }

        if (!openQuotationWithSize) {
            throw new Error('Unable to open initial position meeting minTradeValue');
        }

        const [openTradeParam] = new TradeInput(takerWallet.account.address, openBaseQuantity, Side.LONG).simulate(
            takerBeforeOpen,
            openQuotationWithSize,
            userSetting
        );

        const openHash = await takerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(openTradeParam)],
        });
        await waitForTx(openHash);

        const makerBeforePlace = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            makerWallet.account.address
        );

        const { instrumentSetting } = makerBeforePlace;
        const spacing = instrumentSetting.orderSpacing;
        const feasible = instrumentSetting.getFeasibleLimitOrderTickRange(
            Side.SHORT,
            makerBeforePlace.amm.tick,
            makerBeforePlace.priceData.markPrice
        );
        if (!feasible) {
            throw new Error('No feasible tick range for SHORT limit orders');
        }

        const baseTick = feasible.minTick;
        const maxMultiplier = Math.floor((feasible.maxTick - baseTick) / spacing);
        if (maxMultiplier < 4) {
            throw new Error('Feasible tick range too narrow for multi-order test');
        }

        const preferredOffsets = [3, 20, 40, 80];
        const offsets =
            maxMultiplier >= preferredOffsets[preferredOffsets.length - 1]
                ? preferredOffsets
                : [
                      1,
                      Math.max(2, Math.floor(maxMultiplier / 3)),
                      Math.max(3, Math.floor((2 * maxMultiplier) / 3)),
                      maxMultiplier,
                  ];

        const orderTicks = offsets.map((offset) => baseTick + offset * spacing);

        let orderBaseQuantity = WAD / 5n;
        let placeParams: Array<ReturnType<PlaceInput['simulate']>[0]> | undefined;

        for (let attempt = 0; attempt < 8; attempt += 1) {
            try {
                const smallSize = orderBaseQuantity;
                const largeSize = orderBaseQuantity * 2n;
                placeParams = [
                    new PlaceInput(makerWallet.account.address, orderTicks[0]!, smallSize, Side.SHORT).simulate(
                        makerBeforePlace,
                        userSetting
                    )[0],
                    new PlaceInput(makerWallet.account.address, orderTicks[1]!, smallSize, Side.SHORT).simulate(
                        makerBeforePlace,
                        userSetting
                    )[0],
                    new PlaceInput(makerWallet.account.address, orderTicks[2]!, largeSize, Side.SHORT).simulate(
                        makerBeforePlace,
                        userSetting
                    )[0],
                    new PlaceInput(makerWallet.account.address, orderTicks[3]!, largeSize, Side.SHORT).simulate(
                        makerBeforePlace,
                        userSetting
                    )[0],
                ];
                break;
            } catch {
                orderBaseQuantity *= 2n;
            }
        }

        if (!placeParams) {
            throw new Error('Unable to find a placeParam set that passes simulation validation');
        }

        for (const placeParam of placeParams) {
            const placeHash = await makerWallet.writeContract({
                address: INSTRUMENT_ADDRESS,
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'place',
                args: [encodePlaceParam(placeParam)],
            });
            await waitForTx(placeHash);
        }

        const makerAfterPlace = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            makerWallet.account.address
        );
        expect(makerAfterPlace.portfolio.orders.length).toBe(4);

        // Cross the first order tick.
        const takerBeforeCrossOne = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            takerWallet.account.address
        );
        const crossOne = await inquireByTick(INSTRUMENT_ADDRESS, EXPIRY, orderTicks[0]! + 1, ctx.rpcConfig);
        const crossOneQuotation = new QuotationWithSize(crossOne.size, crossOne.quotation);
        const crossOneSide = crossOne.size >= 0n ? Side.LONG : Side.SHORT;
        const crossOneBaseQuantity = abs(crossOne.size);

        const [crossOneTradeParam] = new TradeInput(
            takerWallet.account.address,
            crossOneBaseQuantity,
            crossOneSide
        ).simulate(takerBeforeCrossOne, crossOneQuotation, userSetting);

        const crossOneHash = await takerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(crossOneTradeParam)],
        });
        await waitForTx(crossOneHash);

        // Cross two order levels by targeting the third order tick (matching Hardhat behavior).
        const takerBeforeCrossTwo = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            takerWallet.account.address
        );
        const crossTwo = await inquireByTick(INSTRUMENT_ADDRESS, EXPIRY, orderTicks[2]!, ctx.rpcConfig);
        const crossTwoQuotation = new QuotationWithSize(crossTwo.size, crossTwo.quotation);
        const crossTwoSide = crossTwo.size >= 0n ? Side.LONG : Side.SHORT;
        const crossTwoBaseQuantity = abs(crossTwo.size);

        const [crossTwoTradeParam] = new TradeInput(
            takerWallet.account.address,
            crossTwoBaseQuantity,
            crossTwoSide
        ).simulate(takerBeforeCrossTwo, crossTwoQuotation, userSetting);

        const crossTwoHash = await takerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(crossTwoTradeParam)],
        });
        await waitForTx(crossTwoHash);

        // Trade within the remaining order book/liquidity (not necessarily crossing new ticks).
        const takerBeforeThird = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            takerWallet.account.address
        );
        const thirdBaseQuantity = WAD / 10n;
        const thirdQuotationRaw = await inquireByBaseSize(INSTRUMENT_ADDRESS, EXPIRY, thirdBaseQuantity, ctx.rpcConfig);
        const thirdQuotation = new QuotationWithSize(thirdBaseQuantity, thirdQuotationRaw);

        const [thirdTradeParam] = new TradeInput(takerWallet.account.address, thirdBaseQuantity, Side.LONG).simulate(
            takerBeforeThird,
            thirdQuotation,
            userSetting
        );

        const thirdHash = await takerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(thirdTradeParam)],
        });
        await waitForTx(thirdHash);

        const makerAfterTake = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            makerWallet.account.address
        );

        const findOrderByTick = (tick: number) => {
            const index = makerAfterTake.portfolio.orders.findIndex((order) => order.tick === tick);
            if (index < 0) throw new Error(`Missing maker order for tick=${tick}`);
            const order = makerAfterTake.portfolio.orders[index];
            const taken = makerAfterTake.portfolio.ordersTaken[index] ?? 0n;
            return { order, taken };
        };

        const order0 = findOrderByTick(orderTicks[0]!);
        const order1 = findOrderByTick(orderTicks[1]!);
        const order2 = findOrderByTick(orderTicks[2]!);
        const order3 = findOrderByTick(orderTicks[3]!);

        expect(abs(order0.taken)).toBeGreaterThanOrEqual(abs(order0.order.size));
        expect(abs(order1.taken)).toBeGreaterThanOrEqual(abs(order1.order.size));
        expect(abs(order2.taken)).toBeGreaterThan(0n);

        const expectedFinalSize = order0.order.size + order1.order.size + order2.taken + order3.taken;

        const fill0Hash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'fill',
            args: [
                encodeFillParam({
                    expiry: EXPIRY,
                    target: makerWallet.account.address,
                    tick: order0.order.tick,
                    nonce: order0.order.nonce,
                }),
            ],
        });
        await waitForTx(fill0Hash);

        const fill1Hash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'fill',
            args: [
                encodeFillParam({
                    expiry: EXPIRY,
                    target: makerWallet.account.address,
                    tick: order1.order.tick,
                    nonce: order1.order.nonce,
                }),
            ],
        });
        await waitForTx(fill1Hash);

        const makerAfterFill = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            makerWallet.account.address
        );
        expect(makerAfterFill.portfolio.orders.length).toBe(2);
        expect(makerAfterFill.portfolio.position.size).toBe(order0.order.size + order1.order.size);

        const cancelDeadline = userSetting.getDeadline(makerAfterFill.blockInfo.timestamp);
        const cancel2Hash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'cancel',
            args: [
                encodeCancelParam({
                    expiry: EXPIRY,
                    ticks: [order2.order.tick],
                    deadline: cancelDeadline,
                }),
            ],
        });
        await waitForTx(cancel2Hash);

        const cancel3Hash = await makerWallet.writeContract({
            address: INSTRUMENT_ADDRESS,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'cancel',
            args: [
                encodeCancelParam({
                    expiry: EXPIRY,
                    ticks: [order3.order.tick],
                    deadline: cancelDeadline,
                }),
            ],
        });
        await waitForTx(cancel3Hash);

        const makerAfterCancel = await fetchOnchainContext(
            INSTRUMENT_ADDRESS,
            EXPIRY,
            ctx.rpcConfig,
            makerWallet.account.address
        );
        expect(makerAfterCancel.portfolio.orders.length).toBe(0);
        expect(makerAfterCancel.portfolio.position.size).toBe(expectedFinalSize);
    });
});
