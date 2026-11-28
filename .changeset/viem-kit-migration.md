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
  adds the `trader` address sent by the server, which is absent when the server sends it
  empty. Trade items must carry their own `chainId`, `instrumentAddress` and `expiry`; the SDK
  no longer copies them from the message.
- Retired ABC deployment defaults are removed; demos require explicit execution settings.
- The default HTTP and public WebSocket endpoints move from `mainnet-api.monday.trade`, which
  lists no perpetual markets, to the Base deployment at `base-api.synfutures.com`. To keep
  another deployment, set `baseUrl` and the WebSocket URL (`wsOptions.url` in the `PerpClient` constructor options, or
  `url` on `PublicWebsocketClient`).
- API request and response types follow the server contract. The server has no order-book
  `depth` parameter: `FetchMmOrderBookInput.depth` is removed, and `MmOrderBookSubscribeParams`
  is replaced by `OrderBookSubscribeParams`. `FetchFuturesPairKlineChartInput.endTime` and
  `FetchMmKlineInput.interval` are required. History `typeString` unions list the values the
  server sends: trades use `Market`, `Limit`, `Liquidity`, `Liquidation` or `Taker Over`,
  orders use `filled` or `cancelled`, and liquidity events use `add` or `remove`.
  `MarketFromApi.info.beacon` is optional, and `AmmFromApi.status` and
  `SettingFromApi.quoteParam.qtype` use the `Status` and `QuoteType` enums.
  `PortfolioFromApi.position` is the single optional position the server sends, not an array.

- Pass named `deadlineSeconds`, `slippageBps` and `leverageWad` to `UserSetting`. Choose `ticks` or `pricesWad` for scaled orders.
- Select the ABI by contract version. Use the Gate deployment descriptor from `getPerpInfo` in deposit and withdrawal encoders. The Base deployment pairs a current Observer with a legacy Gate.
- Select a `direct`, `for` or `router` transaction route. Pass a signed permit directly to `encodePermit`. Regular approvals use `encodeApprove`.
- Explicit block reads require RPC. RPC order books use the context block for every depth level. An account-free snapshot has a null quote state, and estimated prices expose their source.
- API configuration accepts native fetch options. Signed module availability is explicit on `PerpClient.market` and `PerpClient.mm`. Each client owns its WebSocket unless a shared client is passed explicitly.
- Wire normalization and HTTP URL helpers are internal. MM endpoints validate rows and pagination before exposing typed results.

Liquidity limits include the observed AMM tick at zero slippage. Limit order ranges and single-tick checks share the same aligned price bounds. Scaled order simulations report the minimum total for their allocation ratios and expose per-level failures alongside the existing order slots. Observer snapshots use a single contract read and work with viem clients without chain metadata.
