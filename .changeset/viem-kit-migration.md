---
'@synfutures/perpv3-ts': major
---

Migrate the SDK to the refactored `@derivation-tech/viem-kit` 1.0 API and remove legacy helpers.

- Node.js 22 or newer is required, matching viem-kit.
- Contract parsers use viem-kit's typed parser API. Transaction and event descriptions use
  ABI-inferred arguments, and decoded contract errors fall back to viem-kit's formatting
  unless a parser defines a custom message. Legacy parser compatibility is removed.
- Build write requests inline as `TypedWriteRequest` objects with the ABIs from
  `@synfutures/perpv3-ts/abis`. `contractCallEncoder` keeps its encoding methods.
- `splitSignature` and the direct `@noble/curves` dependency are removed. Use viem's
  `parseSignature`; for contracts that expect a traditional `v`, pass `yParity + 27`.
  ERC-20 permit calldata normalizes recovery values 0/1 to 27/28 and rejects other values.
- Removed exports: `bigIntObjectCheckByKeys`, the `*_BIGINT_KEYS` lists and
  `decodeTradeWithStabilityFeeParam`. API decoders now convert integer fields themselves.
- Free helper functions moved to module methods:

| Removed helper family    | Replacement                 |
| ------------------------ | --------------------------- |
| MM helpers               | `MarketMakerModule` methods |
| signed market helpers    | `MarketModule` methods      |
| public portfolio helpers | `PublicModule` methods      |
| token helpers            | `TokenModule` methods       |
| history helpers          | `HistoryModule` methods     |

- MM instrument `minMarginAmount` and `tip` are `bigint`, matching their decoded values.
- WebSocket `TradeItem` drops the duplicated `instrument` field; use `instrumentAddress`. It
  adds the `trader` address sent by the server. Trade items must carry their own `chainId`,
  `instrumentAddress` and `expiry`; the SDK no longer copies them from the message.
- Retired ABC deployment defaults are removed; demos require explicit execution settings.
