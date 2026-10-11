# Queries and data boundaries

## Configuration ownership

`PerpClient` binds one instrument and expiry to an `ApiConfig` or `RpcConfig`.
An `ApiConfig.baseUrl` creates an instance-owned HTTP client without mutating the
caller's configuration. Direct query helpers also resolve this setting. Without it,
HTTP requests go to `https://base-api.synfutures.com` and the public WebSocket to
`wss://base-api.synfutures.com/v4/public/ws`, the Base deployment.
`RpcConfig` supplies `chainId`, `publicClient` and `observerAddress`; these values
must describe the same deployment.

For API-backed clients, `rpcFallback` must use the same chain ID. Signed market
queries without a signer go directly to the configured RPC fallback. If both
paths fail, the aggregate error retains both causes. An absent order book can
trigger fallback; it is not a successful empty book. `ReadOptions.blockNumber`
and `blockTag` apply to RPC reads, not API snapshots.

`getSnapshot`, `getQuotation`, `inquire` and `getOrderBook` expose pair-scoped
reads. Use the functions from `/queries` when the caller already owns the pair
and configuration. Neither interface sends a transaction.

## HTTP modules

Import `PublicModule`, `MarketModule`, `MarketMakerModule`, `TokenModule` and
`HistoryModule` from `/apis`. Their constructor types specify the required
`HttpClient`, signer or MM authentication. The former standalone helper family
has been removed; use the matching module method rather than a second facade.

The on-chain context and quotation API decoders validate `unknown` payloads before
constructing domain objects. Integer strings become `bigint` where the domain
requires exact integers; malformed required fields throw. Missing data, a zero
value and a decoding failure have different meanings. For example, MM instrument
`minMarginAmount` and `tip` are `bigint`, not strings or JavaScript numbers.

HTTP 5xx responses can be retried for GET, HEAD and OPTIONS, subject to the
configured retry limit and backoff. POST, PUT and DELETE are not automatically
repeated. A failed response does not prove that a write did not happen.
Query serialization retains explicit `0` and `false` and omits nullish values.

## WebSockets

Use `PerpClient` subscription methods for a bound pair, or `PublicWebsocketClient`
from `/apis` for explicit subscription management. Each subscription returns an
unsubscribe operation; release it when the owning view or workflow ends. Identical wire
topics remain subscribed until their last typed or raw subscriber is removed. Events from
a replaced socket cannot reset the active connection or deliver stale data.

The transport, request/acknowledgment protocol, subscription registry and payload
normalization have separate owners. Stream schemas validate metadata and required
fields before calling typed handlers. Invalid input follows the error path rather
than producing fabricated zero amounts or incomplete domain objects.

Browsers can use their native WebSocket. Environments without a compatible global
WebSocket must provide `wsFactory` (for example, using the optional `ws` package).
Custom headers also require a transport that supports them. Importing the package
does not establish a connection.
