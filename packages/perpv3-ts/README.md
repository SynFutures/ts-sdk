# SynFutures V3 TypeScript SDK

TypeScript SDK for simulating and interacting with SynFutures V3 Perpetual Contracts.

## Features

- 🚀 **Type-Safe** - Full TypeScript support with type definitions
- 🔧 **Viem Integration** - Built on top of viem for Ethereum interactions
- 📦 **Modular** - Clean, modular architecture
- 🎯 **Contract-First** - Types mirror Solidity contracts exactly
- 💼 **Simulation API** - Class-based input classes for trade, order, and range operations
- 🔄 **Unified Queries** - Single API for fetching data from RPC or API endpoints
- ✅ **Validation Helpers** - Comprehensive helper methods for order placement, position management, and range operations
- 🎬 **Demo Framework** - Built-in demo framework for testing and examples

## Installation

```bash
npm install @synfutures/perpv3-ts
```

## Local Devnet Tests

This repo includes a self-contained local devnet harness under `packages/perpv3-ts/devnet/` for integration-style SDK testing.

- Generate/refresh the committed devnet snapshot: `pnpm -C packages/perpv3-ts run devnet:regen`
- Run devnet tests (starts Anvil, loads `devnet/state.json`, runs Jest with `maxWorkers=1`): `pnpm -C packages/perpv3-ts run test:devnet`
- Contract artifacts are loaded from `@synfutures/v3-contracts` (including the devnet-only helper contracts used by `devnet:regen`).

If `devnet/state.json` becomes stale (artifacts/preset changed), `test:devnet` will fail fast and instruct you to run `devnet:regen` and commit the updated snapshot files.

## Architecture

### Directory Structure

```text
src/
├── abis/           # Contract ABIs (latest and legacy)
├── actions/        # Simulation action classes
│   ├── trade.ts           # Market trade simulation (TradeInput)
│   ├── adjust.ts          # Margin/leverage adjustment (AdjustInput)
│   ├── order.ts           # Limit order simulation (PlaceInput)
│   ├── crossLimitOrder.ts # Cross limit order simulation (CrossLimitOrderInput)
│   ├── scaledLimitOrder.ts # Batch/scaled limit orders (ScaledLimitOrderInput, BatchOrderSizeDistribution)
│   └── range.ts           # Range liquidity simulation (AddInput, RemoveInput)
├── apis/           # API-specific implementations
├── client.ts       # PerpClient
├── constants.ts    # Shared constants
├── frontend/       # Frontend utilities (calldata encoding, parsers)
├── info.ts         # Chain configuration (PerpInfo)
├── math.ts         # Math utilities
├── parsers/        # Contract event/log parsers
├── queries/        # Unified data fetching (API/RPC)
│   ├── api.ts      # API implementation
│   ├── rpc.ts      # RPC implementation
│   └── index.ts    # Unified entry point
├── tests/          # Test files and fixtures
├── types/          # Type definitions
│   ├── contract.ts  # Core domain types (1:1 Solidity mirror)
│   ├── snapshot.ts # PairSnapshot (context + validations)
│   ├── position.ts # Position class
│   ├── order.ts    # Order class
│   ├── range.ts    # Range class
│   ├── quotation.ts # QuotationWithSize class
│   ├── setting.ts  # UserSetting and InstrumentSetting classes
│   └── error.ts    # Typed Errors and error codes
├── utils/          # Utility functions
└── wss.ts          # WebSocketManager

examples/
├── framework/      # Demo framework (runner, registry, context)
├── trade.ts        # Trade demos
├── order.ts        # Order demos
├── range.ts        # Range demos
└── index.ts        # Demo runner entry
```

### Type Organization

**Core Domain Types** (`types/contract.ts`):

- Types that are 1:1 mirrors of Solidity structs/enums
- Used across multiple modules
- Fundamental business entities (Amm, Portfolio, Setting, etc.)

**Class-Based Types** (`types/*.ts`):

- `Position` - Position class with encapsulated behavior
- `Order` - Order class with static factory methods
- `Range` - Range class with static key packing/unpacking
- `QuotationWithSize` - Quotation with size calculations
- `UserSetting` - User settings with helper methods
- `InstrumentSetting` - Instrument settings factory
- `PairSnapshot` - Snapshot class with validation helpers and context

**Action Classes** (`actions/*.ts`):

- Input classes for simulations (TradeInput, PlaceInput, etc.)
- Each class has a `simulate()` method that returns simulation results
- Validation and encoding utilities

## Usage

### Basic Setup with PerpClient (Recommended)

```typescript
import { parseUnits } from 'viem';
import { PerpClient } from '@synfutures/perpv3-ts';
import { TradeInput, QuotationWithSize } from '@synfutures/perpv3-ts/actions';
import { Side, UserSetting, PERP_EXPIRY } from '@synfutures/perpv3-ts/types';
import { WAD } from '@synfutures/perpv3-ts/constants';

// Create PerpClient - centralizes configuration
const client = new PerpClient(
    rpcConfig,
    new UserSetting(10, 10, 3n * WAD, 1),
    instrumentAddress,
    PERP_EXPIRY
);

// Fetch snapshot and quotation
const snapshot = await client.getSnapshot(traderAddress);
const side = Side.LONG;
const baseQuantity = parseUnits('1', 18);
const signedSize = side === Side.LONG ? baseQuantity : -baseQuantity;
const snapshotWithQuotation = await client.getSnapshot(traderAddress, signedSize);
const quotation = snapshotWithQuotation.quotation!;
const quotationWithSize = new QuotationWithSize(signedSize, quotation);

// Create input and simulate
const tradeInput = new TradeInput(traderAddress, baseQuantity, side);
const [param, sim] = tradeInput.simulate(snapshot, quotationWithSize, client.userSetting);
```

### Basic Setup (Legacy API)

```typescript
import { createPublicClient, http, parseUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { getPerpInfo } from '@synfutures/perpv3-ts';
import { fetchOnchainContext } from '@synfutures/perpv3-ts/queries';
import { TradeInput, QuotationWithSize } from '@synfutures/perpv3-ts/actions';
import { PERP_EXPIRY, UserSetting, Side } from '@synfutures/perpv3-ts/types';
import { WAD } from '@synfutures/perpv3-ts/constants';

const chainId = mainnet.id;

// Create a public client
const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(),
});

const userSetting = new UserSetting(
    10, // deadline seconds offset
    10, // slippage tolerance in bps (0.1%)
    3n * WAD, // leverage in WAD (3x)
    1 // mark price buffer in bps (optional)
);

// Get perp info for the chain
const perpInfo = getPerpInfo(chainId);
const rpcConfig = { chainId, publicClient, observerAddress: perpInfo.observer };
const expiry = PERP_EXPIRY;

const side = Side.LONG;
const baseQuantity = parseUnits('1', 18);
const signedSize = side === Side.LONG ? baseQuantity : -baseQuantity;

// Fetch onchain context
const onchainContext = await fetchOnchainContext(
    instrumentAddress,
    expiry,
    rpcConfig,
    traderAddress
);

// Fetch quotation first (required for trade simulation)
const onchainContextWithQuotation = await fetchOnchainContext(
    instrumentAddress,
    expiry,
    rpcConfig,
    traderAddress,
    signedSize
);

// Create trade input and simulate
const tradeInput = new TradeInput(
    traderAddress,
    baseQuantity, // baseQuantity in WAD
    side,
    parseUnits('100', 18) // margin in WAD (optional)
);

const quotationWithSize = new QuotationWithSize(signedSize, onchainContextWithQuotation.quotation!);

const [tradeParam, simulation] = tradeInput.simulate(onchainContext, quotationWithSize, userSetting);
```

### Simulation Actions

The SDK provides class-based input classes for various operations. Each input class has a `simulate()` method that returns simulation results.

#### Trading

```typescript
import { parseUnits } from 'viem';
import { TradeInput, AdjustInput, QuotationWithSize } from '@synfutures/perpv3-ts/actions';
import { PERP_EXPIRY, Side, UserSetting } from '@synfutures/perpv3-ts/types';
import { WAD } from '@synfutures/perpv3-ts/constants';

const userSetting = new UserSetting(10, 10, 3n * WAD, 1);

// Trade by margin amount
const tradeByMargin = new TradeInput(
    traderAddress,
    parseUnits('1', 18), // baseQuantity in WAD
    Side.LONG,
    parseUnits('100', 18) // margin in WAD (optional)
);
// First fetch quotation, then simulate
const quotationWithSize = new QuotationWithSize(signedSize, quotation);
const [tradeParam, simulation] = tradeByMargin.simulate(onchainContext, quotationWithSize, userSetting);

// Trade by target leverage
const leverageUserSetting = new UserSetting(10, 10, 5n * WAD, 1);
const tradeByLeverage = new TradeInput(
    traderAddress,
    parseUnits('1', 18), // baseQuantity
    Side.LONG
);
const [tradeParam, simulation] = tradeByLeverage.simulate(onchainContext, quotationWithSize, leverageUserSetting);

// Close position
const closeSignedSize = -position.size; // signed trade size (opposite of position size)
const closeSide = closeSignedSize >= 0n ? Side.LONG : Side.SHORT;
const closeTrade = new TradeInput(
    traderAddress,
    closeSignedSize >= 0n ? closeSignedSize : -closeSignedSize, // positive quantity
    closeSide
);
const closeQuotationWithSize = new QuotationWithSize(closeSignedSize, quotation);
const [tradeParam, simulation] = closeTrade.simulate(onchainContext, closeQuotationWithSize, userSetting);
// Note: `tradeParam.amount` can be negative when closing/reducing,
// which indicates a margin withdrawal. Only check balance/allowance when `tradeParam.amount > 0`.

// Adjust margin
const adjustMargin = new AdjustInput(
    traderAddress,
    parseUnits('0.5', 18), // marginDelta in WAD
    true // transferIn
);
const [adjustParam, simulation] = adjustMargin.simulate(onchainContext, userSetting);

// Adjust leverage
const targetLeverageUserSetting = new UserSetting(10, 10, 3n * WAD, 1);
const adjustLeverage = new AdjustInput(traderAddress);
const [adjustParam, simulation] = adjustLeverage.simulate(onchainContext, targetLeverageUserSetting);

// Reduce position (adjusts to target leverage)
const reducePosition = new TradeInput(
    traderAddress,
    parseUnits('4', 18), // Reduce by 4 units (positive quantity)
    Side.SHORT // Opposite side of existing LONG position
);
const [tradeParam, simulation] = reducePosition.simulate(onchainContext, quotationWithSize, userSetting);
// tradeParam.amount can be positive (deposit) or negative (withdraw) depending on leverage adjustment
// Post-trade leverage will match the target leverage specified in userSetting
```

**Note on Leverage Management:** All trades (opening, increasing, or reducing positions) adjust margin to achieve the target leverage specified in `userSetting`. When reducing a position, margin adjustment depends on whether you're increasing or decreasing leverage. If the required withdrawal exceeds `maxWithdrawableMargin` (based on IMR), the withdrawal is capped and `simulation.marginAdjusted` will be `true`. `marginAdjusted` is also set to `true` when the position exceeds IMR and additional margin is automatically added to meet requirements.

#### Orders

```typescript
import { parseUnits } from 'viem';
import {
    PlaceInput,
    CrossLimitOrderInput,
    ScaledLimitOrderInput,
    BatchOrderSizeDistribution,
} from '@synfutures/perpv3-ts/actions';
import { UserSetting, Side } from '@synfutures/perpv3-ts/types';
import { WAD } from '@synfutures/perpv3-ts/constants';

const userSetting = new UserSetting(10, 10, 3n * WAD, 1);

// Place a limit order
const placeOrder = new PlaceInput(
    traderAddress,
    200000, // tick
    parseUnits('0.01', 18), // baseQuantity (unsigned)
    Side.SHORT
);
const [placeParam, simulation] = placeOrder.simulate(onchainContext, userSetting);

// Cross limit order (market leg + limit leg)
const crossMarketOrder = new CrossLimitOrderInput(
    traderAddress,
    Side.LONG,
    parseUnits('1', 18), // baseQuantity
    199000 // targetTick (must be on the correct side of the AMM tick)
);
const crossSimulation = crossMarketOrder.simulate(onchainContext, swapQuote, userSetting);

// Scaled limit order
const scaledOrder = new ScaledLimitOrderInput(
    traderAddress,
    Side.LONG,
    parseUnits('1', 18), // baseQuantity
    [200000, 199000, 198000], // priceInfo (ticks or WAD prices)
    BatchOrderSizeDistribution.FLAT
);
const simulation = scaledOrder.simulate(onchainContext, userSetting);
```

**Notes:**

- `PlaceInput` validates `baseQuantity` in the constructor (must be positive), so invalid inputs may throw before calling `simulate()`.
- `ScaledLimitOrderSimulation` contains `{ orders, minBase }`. Each `orders[i]` is either `{ ratio, param, simulation }` or `null` if that slot failed to simulate; you can derive totals by reducing over `orders`.

#### Range Liquidity

```typescript
import { parseUnits } from 'viem';
import { AddInput, RemoveInput } from '@synfutures/perpv3-ts/actions';
import { UserSetting } from '@synfutures/perpv3-ts/types';
import { WAD } from '@synfutures/perpv3-ts/constants';

const userSetting = new UserSetting(10, 10, 3n * WAD, 1);

// Add liquidity to a range
const addLiquidity = new AddInput(
    traderAddress,
    parseUnits('10', 18), // marginAmount in WAD
    190000, // tickLower
    210000 // tickUpper
);
const [addParam, simulation] = addLiquidity.simulate(onchainContext, userSetting);

// Remove liquidity from a range
const removeLiquidity = new RemoveInput(
    traderAddress,
    190000, // tickLower
    210000 // tickUpper
);
const [removeParam, simulation] = removeLiquidity.simulate(onchainContext, userSetting);
```

### Validation Helpers

The SDK provides comprehensive helper methods to validate operations before simulation. These methods return structured results with clear error messages.

#### Quick Reference

```typescript
import { Side } from '@synfutures/perpv3-ts/types';

// ✅ Recommended: Full feasibility check for order placement
const result = snapshot.isTickFeasibleForLimitOrder(1000, Side.LONG);
if (!result.feasible) {
    console.error(`Cannot place order: ${result.reason}`);
}

// Check if instrument is tradable
const tradability = snapshot.isTradable();
if (!tradability.tradable) {
    console.error(`Cannot trade: ${tradability.reason}`);
}

// Get feasible tick range for limit orders
const range = snapshot.getFeasibleLimitOrderTickRange(Side.LONG);
if (range) {
    console.log(`Can place LONG orders from tick ${range.minTick} to ${range.maxTick}`);
}

// Check if margin can be withdrawn
const withdrawalCheck = snapshot.isWithdrawalAllowed();
const maxWithdrawable = snapshot.getMaxWithdrawableMargin();

// Check if leverage is valid
if (!snapshot.instrumentSetting.isLeverageValid(5n * WAD)) {
    console.error('Leverage too high');
}

// Get available orders (not fully taken)
const availableOrders = snapshot.getAvailableOrders();
```

#### Key Methods Comparison

**`PairSnapshot.isTickFeasibleForLimitOrder(tick, side)`** - Use for actual order placement

- ✅ Checks instrument tradability (condition, status, pause state)
- ✅ Validates tick (bounds, spacing, side, price deviation)
- ✅ Checks if tick is already occupied by existing order

**`InstrumentSetting.isTickValidForLimitOrder(tick, side, ammTick, markPrice)`** - Use for theoretical calculations

- ✅ Validates tick properties only
- ❌ Does NOT check market state or order slots

**Example - Finding available tick:**

```typescript
const range = snapshot.getFeasibleLimitOrderTickRange(Side.LONG);
if (range) {
    const spacing = snapshot.instrumentSetting.orderSpacing;
    // Iterate from best price to find first available tick
    for (let tick = range.maxTick; tick >= range.minTick; tick -= spacing) {
        const result = snapshot.isTickFeasibleForLimitOrder(tick, Side.LONG);
        if (result.feasible) {
            console.log(`Available tick: ${tick}`);
            break;
        }
    }
}
```

**Available Helper Methods:**

_PairSnapshot (context-aware):_

- `isTradable()` - Basic tradability check
- `isOrderPlacementTradable()` - Order placement check (includes pause state)
- `isTickFeasibleForLimitOrder(tick, side)` - Comprehensive tick validation
- `getFeasibleLimitOrderTickRange(side)` - Get feasible tick range
- `getOccupiedLimitOrderTicks()` - Get occupied tick list
- `getAvailableOrders()` - Get orders not fully taken
- `isWithdrawalAllowed()` - Check if withdrawal is allowed
- `getMaxWithdrawableMargin()` - Get max withdrawable amount
- `isRemoveLiquidityFeasible(tickLower, tickUpper)` - Check range removal

_InstrumentSetting (pure validation):_

- `isLeverageValid(leverage)` - Check leverage validity
- `minOrderSizeAtTick(tick)` - Calculate min order size at tick
- `getFeasibleLimitOrderTickRange(side, ammTick, markPrice)` - Get theoretical range
- `isTickValidForLimitOrder(tick, side, ammTick, markPrice)` - Validate tick properties
- `isRangeTickPairValid(tickLower, tickUpper, ammTick)` - Validate range ticks

_Position:_

- `canAdjustToLeverage(targetLeverage, amm, markPrice, initialMarginRatio)` - Check leverage adjustment

See method JSDoc comments in source code for detailed documentation.

### Data Fetching

The SDK provides unified functions that work with both API and RPC configurations:

```typescript
import type { ApiSigner } from '@synfutures/perpv3-ts';
import { fetchOnchainContext, inquireByTick, fetchOrderBook } from '@synfutures/perpv3-ts/queries';

// Using RPC config
const rpcConfig = {
    chainId: 8453,
    publicClient,
    observerAddress: perpInfo.observer,
};

const onchainContextFromRpc = await fetchOnchainContext(
    instrumentAddress,
    expiry,
    rpcConfig,
    traderAddress, // optional
    signedSize, // optional
    { blockNumber: 12345678n } // optional
);

// Using API config
// Note: API reads require an ApiSigner. If you don't have one, use RpcConfig instead.
const signer: ApiSigner = {
    sign: ({ ts }) => ({
        'X-Api-Nonce': '...',
        'X-Api-Sign': '...',
        'X-Api-Ts': ts,
    }),
};

const apiConfig = { chainId: 143, signer };
const onchainContextFromApi = await fetchOnchainContext(instrumentAddress, expiry, apiConfig, traderAddress, signedSize);

// Inquire by tick
const { size, quotation } = await inquireByTick(instrumentAddress, expiry, tick, rpcConfig);

// Fetch order book
const orderBook = await fetchOrderBook(
    instrumentAddress,
    expiry,
    rpcConfig,
    20 // length
);
```

### Order Book & Portfolio (API + WebSocket)

Use the API helpers for snapshots and the lightweight `PublicWebsocketClient` for pushes.

- Browsers: uses the built-in `WebSocket`.
- Node.js: pass `wsFactory` (e.g. from `ws`) if `globalThis.WebSocket` is unavailable or you need custom headers.

```typescript
import { PERP_EXPIRY } from '@synfutures/perpv3-ts';
import { fetchOrderBook } from '@synfutures/perpv3-ts/queries';
import type { ApiSigner } from '@synfutures/perpv3-ts';
import { fetchPortfolioListFromApi, PublicWebsocketClient } from '@synfutures/perpv3-ts';

// API snapshots
const signer: ApiSigner = {
    sign: ({ ts }) => ({
        'X-Api-Nonce': '...',
        'X-Api-Sign': '...',
        'X-Api-Ts': ts,
    }),
};
const apiConfig = { chainId: 143, signer };
const orderBook = await fetchOrderBook(instrumentAddress, PERP_EXPIRY, apiConfig);
const portfolio = await fetchPortfolioListFromApi(
    {
        chainId: 143,
        userAddress,
        instrumentAddress,
        expiry: PERP_EXPIRY,
    },
    signer
);

// Real-time updates
const ws = new PublicWebsocketClient();
const orderBookSub = ws.subscribeOrderBook(
    { chainId: 143, instrument: instrumentAddress, expiry: PERP_EXPIRY, type: 'orderBook' },
    (data) => {
        console.log('top of book', data.bids?.[0]?.price, data.asks?.[0]?.price);
    }
);
const portfolioSub = ws.subscribePortfolio({ chainId: 143, userAddress, type: 'portfolio' }, (payload) => {
    // WebSocket notifies that something changed; fetch the latest details from the API.
    console.log('portfolio changed', payload.type, payload.instrument, payload.expiry);
});

// Later, clean up
orderBookSub.unsubscribe();
portfolioSub.unsubscribe();
ws.close();
```

> WebSocket client defaults: auto-reconnect with exponential backoff (base 1s, capped at 30s), stops after 10 attempts unless you set `maxReconnectAttempts` or supply your own `reconnectDelayMs` (which keeps retrying). Use `pingIntervalMs` to tune heartbeat (default 30s).
> Order book streams forward the server payload as-is (with chainId/instrument/expiry merged); current feeds are ratio-keyed multi-depth maps (e.g. `"1"`, `"10"`...). Use `depths`/ratio keys from the payload.
> REST requests are sent to `https://mainnet-api.monday.trade` (fixed, no API_DOMAIN env needed); set `chainId` to 143 for mainnet.

Other public streams:

```typescript
// Trades (market maker feed)
// Each pair is "<instrumentAddress>_<expiry>" (address lowercased, expiry as a number).
const tradesPairs = [`${instrumentAddress.toLowerCase()}_${PERP_EXPIRY}`];
const tradesSub = ws.subscribeTrades({ chainId: 143, pairs: tradesPairs, type: 'trades' }, (trade) => {
    console.log('trade', trade.id, trade.instrumentAddress, trade.expiry);
});

// Kline
const klineSub = ws.subscribeKline(
    { chainId: 143, instrument: instrumentAddress, expiry: PERP_EXPIRY, interval: '1m', type: 'kline' },
    (data) => console.log('kline close', data.close)
);

// Instrument updates (also receives marketPairInfoChanged)
const instrumentSub = ws.subscribeInstrument(
    { chainId: 143, instrument: instrumentAddress, expiry: PERP_EXPIRY, type: 'instrument' },
    (data) => console.log('instrument update', data.symbol, data.fairPrice)
);

// Common chain events (blockNumChanged, marketListChanged)
const commonSub = ws.subscribeCommon({ chainId: 143, type: 'common' }, (data) => console.log('common', data));

// Generic catch-all for new/unknown streams (list expected stream names)
const rawSub = ws.subscribeRaw(
    { chainId: 143, instrument: instrumentAddress, expiry: PERP_EXPIRY, type: 'instrument' },
    (data) => console.log('raw stream payload', data),
    ['instrument', 'marketPairInfoChanged']
);
```

### Running Demos

The SDK includes a demo framework for testing and examples:

> Note: The `examples/` folder (and `npm run demo`) are only available in this repository and are not included in the published npm package.

```bash
# List all available demos
npm run demo -- --list

# Run a specific demo
npm run demo trade-by-margin

# Run all demos in a category
npm run demo -- --category trade

# Run with custom chain/signer/instrument
npm run demo -- --chain abctest --signer neo --instrument ETH-USDM-EMG

# Skip cleanup after demos
npm run demo -- --skip-cleanup
```

## License

MIT
