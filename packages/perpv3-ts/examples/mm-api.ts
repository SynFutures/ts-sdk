import type { Address } from 'viem';
import {
    PERP_EXPIRY,
    KlineInterval,
    fetchMmOrderBook,
    fetchMmWalletBalance,
    fetchMmPositionList,
    PublicWebsocketClient,
    AuthInfo,
    fetchMmServerTime,
    fetchMmTickers,
    fetchMmAccountTransactionHistory,
    fetchMmTradeHistory,
    fetchMmFundingHistory,
    fetchMmInstrumentInfo,
    fetchMmKline,
    fetchMmLiquidityList,
    fetchMmLiquidityHistory,
    fetchMmOrderHistory,
    fetchMmOrderRealtime,
    fetchTokenCoinsWithSymbol,
} from '@synfutures/perpv3-ts';
import 'dotenv/config';

const CHAIN_ID = 143;
const SYMBOL = 'BTC/USDC';
/**
 * Address whose on-chain portfolio you want to query (balances/positions/ranges/trades).
 *
 * Important: this is the "trader/owner" address (beneficiary) in SynFutures contracts, not necessarily the tx sender.
 * If you use relayers or `tradeFor/placeFor`, this should still be the `to` address.
 */
const TRADER_ADDRESS = '0xB0B81c2c7686c63acAE28F9778ca8Fa80f0C004b' as Address;
const INSTRUMENT = '0x73ada1ea346cc3908f41cf67a040f0acd7808be0' as Address;
const DURATION_MS = 30_000;
const DEPTH = 20;

const toTradesPair = (instrumentAddress: Address, expiry: number): string =>
    `${instrumentAddress.toLowerCase()}_${expiry}`;

// Trades stream expects pairs in "<instrumentAddress>_<expiry>" format.
const TRADES_PAIRS = [
    toTradesPair('0x44b60b6af9b615a5cf2d366e2143582557cff711' as Address, PERP_EXPIRY),
    toTradesPair('0x8c5243a6a4c6c7a82d954c8ff29e0611e25ac33e' as Address, PERP_EXPIRY),
    toTradesPair(INSTRUMENT, PERP_EXPIRY),
];

async function main(): Promise<void> {
    console.log('=== API snapshots ===');
    // you need to set the API_KEY/API_PASSPHRASE/API_SECRET in the environment variables
    const authInfo: AuthInfo = {
        apiKey: process.env.SYNF_PARITY_API_KEY!,
        passphrase: process.env.SYNF_PARITY_PASSPHRASE!,
        secretKey: process.env.SYNF_PARITY_SECRET_KEY!,
    };

    try {
        const serverTime = await fetchMmServerTime(authInfo);
        console.log('serverTime : ', serverTime);
    } catch (error) {
        console.error('serverTime API error:', (error as Error).message);
    }

    try {
        const orderHistory = await fetchMmOrderHistory({ chainId: CHAIN_ID, address: TRADER_ADDRESS }, authInfo);
        console.log('orderHistory : ', orderHistory?.totalCount, 'list : ', orderHistory?.list?.[0]);
    } catch (error) {
        console.error('orderHistory API error:', (error as Error).message);
    }

    try {
        const orderRealtime = await fetchMmOrderRealtime({ chainId: CHAIN_ID, address: TRADER_ADDRESS }, authInfo);
        console.log('orderRealtime : ', orderRealtime?.length, 'list : ', orderRealtime?.[0]);
    } catch (error) {
        console.error('orderRealtime API error:', (error as Error).message);
    }

    try {
        const tokenCoinsWithSymbol = await fetchTokenCoinsWithSymbol(authInfo);
        console.log('tokenCoinsWithSymbol : ', tokenCoinsWithSymbol?.length, 'list : ', tokenCoinsWithSymbol?.[0]);
    } catch (error) {
        console.error('tokenCoinsWithSymbol API error:', (error as Error).message);
    }

    try {
        const liquidityHistory = await fetchMmLiquidityHistory({ chainId: CHAIN_ID, address: TRADER_ADDRESS }, authInfo);
        console.log('liquidityHistory : ', liquidityHistory?.totalCount, 'list : ', liquidityHistory?.list?.[0]);
    } catch (error) {
        console.error('liquidityHistory API error:', (error as Error).message);
    }

    try {
        const liquidityList = await fetchMmLiquidityList({ chainId: CHAIN_ID, address: TRADER_ADDRESS }, authInfo);
        console.log('liquidityList : ', liquidityList?.[0]);
    } catch (error) {
        console.error('liquidityList API error:', (error as Error).message);
    }

    try {
        const kline = await fetchMmKline({ chainId: CHAIN_ID, symbol: SYMBOL, interval: KlineInterval.HOUR }, authInfo);
        console.log('kline : ', kline?.[0]);
    } catch (error) {
        console.error('kline API error:', (error as Error).message);
    }

    try {
        const instrumentInfo = await fetchMmInstrumentInfo({ chainId: CHAIN_ID, symbol: SYMBOL }, authInfo);
        console.log('instrumentInfo : ', instrumentInfo?.[0]);
    } catch (error) {
        console.error('instrumentInfo API error:', (error as Error).message);
    }

    try {
        const fundingHistory = await fetchMmFundingHistory({ chainId: CHAIN_ID, symbol: SYMBOL }, authInfo);
        console.log('fundingHistory : ', fundingHistory?.[0]);
    } catch (error) {
        console.error('fundingHistory API error:', (error as Error).message);
    }

    try {
        const tickets = await fetchMmTickers({ chainId: CHAIN_ID }, authInfo);
        console.log('tickets : ', tickets?.[0]);
    } catch (error) {
        console.error('tickets API error:', (error as Error).message);
    }

    try {
        const accountTxHistory = await fetchMmAccountTransactionHistory({ chainId: CHAIN_ID, address: TRADER_ADDRESS }, authInfo);
        console.log('accountTxHistory : ', accountTxHistory?.totalCount);
    } catch (error) {
        console.error('accountTxHistory API error:', (error as Error).message);
    }

    try {
        const tradeHistory = await fetchMmTradeHistory({ chainId: CHAIN_ID, address: TRADER_ADDRESS, symbol: SYMBOL }, authInfo);
        console.log('tradeHistory : ', tradeHistory?.totalCount);
    } catch (error) {
        console.error('tradeHistory API error:', (error as Error).message);
    }

    try {
        const orderBook = await fetchMmOrderBook(
            {
                chainId: CHAIN_ID,
                symbol: SYMBOL,
                ...(Number.isFinite(DEPTH) ? { depth: DEPTH } : {}),
            },
            authInfo
        );
        if (orderBook) {
            const ratios = Object.keys(orderBook);
            const first = ratios[0];
            const ob0 = first ? orderBook[first] : undefined;
            console.log('orderBook ratios:', ratios);
            console.log('first ratio depth:', ob0 ? `bids=${ob0.bids.length} asks=${ob0.asks.length}` : 'n/a');
            if (ob0) {
                const topBid = ob0.bids[0];
                const topAsk = ob0.asks[0];
                console.log('first ratio top levels:', {
                    bid: topBid ? { tick: topBid.tick, price: topBid.price, baseQuantity: topBid.baseQuantity } : null,
                    ask: topAsk ? { tick: topAsk.tick, price: topAsk.price, baseQuantity: topAsk.baseQuantity } : null,
                });
            }
        } else {
            console.log('orderBook ratios: none');
        }
    } catch (error) {
        console.error('orderBook API error:', (error as Error).message);
        console.error('Tip: set API_KEY/API_PASSPHRASE/API_SECRET if your mainnet endpoint enforces auth.');
    }

    try {
        const wallet = await fetchMmWalletBalance({ chainId: CHAIN_ID, address: TRADER_ADDRESS }, authInfo);
        if (wallet?.portfolios?.length) {
            console.log(
                'wallet balance snapshot:',
                wallet.portfolios.map((p) => ({
                    symbol: p.symbol,
                    balance: p.balance.toString(),
                    reserved: p.reservedBalance.toString?.(),
                    maxWithdrawable: p.maxWithdrawable.toString?.(),
                }))
            );
        } else {
            console.log('wallet balance snapshot: empty/null');
        }
    } catch (error) {
        console.error('wallet balance API error:', (error as Error).message);
    }

    try {
        const positions = await fetchMmPositionList({ chainId: CHAIN_ID, address: TRADER_ADDRESS }, authInfo);
        if (positions?.length) {
            console.log(
                'position list snapshot:',
                positions.map((p) => ({
                    symbol: p.symbol,
                    instrument: p.instrumentAddr,
                    size: p.size.toString(),
                    entryPrice: p.entryPrice.toString(),
                    balance: p.balance.toString(),
                    side: p.side,
                    lastUpdateTime: p.lastUpdateTime,
                }))
            );
        } else {
            console.log('position list snapshot: empty/null');
        }
    } catch (error) {
        console.error('position list API error:', (error as Error).message);
    }

    console.log('\n=== WebSocket streams ===');
    const ws = new PublicWebsocketClient({
        onMessage: (msg) => {
            const parsed = msg as { id?: number; result?: string; stream?: string };
            if (parsed?.id && parsed?.result) {
                console.log(`ws ack id=${parsed.id} result=${parsed.result}`);
            }
            if (parsed?.stream === 'orderBook' || parsed?.stream === 'portfolio' || parsed?.stream === 'trades') {
                console.log('ws raw:', JSON.stringify(parsed));
            }
        },
    });

    const obSub = ws.subscribeOrderBook(
        { chainId: CHAIN_ID, instrument: INSTRUMENT, expiry: PERP_EXPIRY, type: 'orderBook' },
        (data) => {
            const ratios = data.depths ? Object.keys(data.depths) : [];
            if (ratios.length === 0) {
                console.log('[orderBook] no depth data');
                return;
            }
            console.log(`[orderBook] ratios: ${ratios.join(', ')}`);
            ratios.forEach((ratio) => {
                const depth = data.depths![ratio];
                const bidCount = depth.bids.length;
                const askCount = depth.asks.length;
                const bestBid = depth.bids[0]?.price;
                const bestAsk = depth.asks[0]?.price;
                console.log(
                    `  ratio ${ratio}: bids=${bidCount} asks=${askCount} bestBid=${bestBid ?? '-'} bestAsk=${bestAsk ?? '-'}`
                );
            });
        }
    );

    const portfolioSub = ws.subscribePortfolio(
        { chainId: CHAIN_ID, userAddress: TRADER_ADDRESS, type: 'portfolio' },
        (payload) => {
            console.log(
                `[portfolio] type=${payload.type} instrument=${payload.instrument ?? '-'} expiry=${payload.expiry ?? '-'}`
            );
        }
    );

    const tradesSub = ws.subscribeTrades(
        {
            chainId: CHAIN_ID,
            pairs: TRADES_PAIRS,
            type: 'trades',
        },
        (data) => {
            console.log('[trades] data:', JSON.stringify(data, null, 2));
        }
    );

    console.log(`listening for ${DURATION_MS}ms...`);
    setTimeout(() => {
        console.log('closing WebSocket');
        obSub.unsubscribe();
        portfolioSub.unsubscribe();
        tradesSub.unsubscribe();
        ws.close();
    }, DURATION_MS);
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
