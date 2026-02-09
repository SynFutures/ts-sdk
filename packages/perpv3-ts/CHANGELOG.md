# @synfutures/perpv3-ts

## 0.2.6

### Patch Changes

- c6aa4c1: perpv3-ts: add impermanent loss helper and fix depth chart

## 0.2.5

### Patch Changes

- Export missing helpers via existing subpath exports. Replace exported const enum types (Side, Status, Condition, QuoteType) with normal enum so consumers with isolatedModules: true can access enum values.

## 0.2.4

### Patch Changes

- Bump deps

## 0.2.3

### Patch Changes

- Fix MM API request signing when query params need percent-encoding (e.g. symbol=BTC/USDC).

## 0.2.2

### Patch Changes

- Update base observer address

## 0.2.1

### Patch Changes

- • For orderbook, should the server push a full snapshot of the latest orderbook immediately
  • For trades, should the server push a batch of recent historical trades, before streaming new trade events

## 0.2.0

### Minor Changes

- Added `trades` subscription support to the WebSocket API
- Renamed `OrderBookLevel.baseQuantity` to `baseSize` and `OrderBookLevel.quoteQuantity` to `quoteSize`.

## 0.1.17

### Patch Changes

- @derivation-tech/viem-kit@0.0.3

## 0.1.16

### Patch Changes

- Update perp info

## 0.1.15

### Patch Changes

- Add moand testnet perp info

## 0.1.14

### Patch Changes

- Update api
- Updated dependencies
    - @derivation-tech/viem-kit@0.0.2

## 0.1.13

### Patch Changes

- First publish
- Updated dependencies
    - @derivation-tech/viem-kit@0.0.1
