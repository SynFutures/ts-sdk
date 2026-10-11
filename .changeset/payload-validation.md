---
'@synfutures/perpv3-ts': patch
---

Reject malformed data instead of substituting defaults.

- HTTP and on-chain query payloads fail with an error that names the field when a required
  value is missing or has the wrong shape. Integers are decoded exactly, and unknown enum
  values such as an unsupported order status are rejected. Explicit zero values, such as
  zero funding hours, are preserved.
- WebSocket stream payloads are validated before typed subscribers see them. Addresses must
  be 20-byte hex values and empty strings are no longer read as zero. A rejected payload is
  reported through `onInvalidStreamData`, whose event now includes the decoding `error`; raw
  subscribers still receive it.
- A trades message is rejected as a whole when any item is malformed or belongs to a different
  chain, instrument or expiry than the message, instead of silently dropping that item. An
  item whose `trader` the server sends as `""` is delivered without `trader`.
- Order-book depths whose `bids` or `asks` are `null` decode as empty sides. The server sends
  `null` for empty ratios, so typed order-book subscribers previously received no updates.
- WebSocket clients ignore events from obsolete sockets and keep a wire subscription until
  its last local subscriber leaves, including overlapping trade pairs.
- Packed parameters reject integer and address overflow before encoding; signed 48-bit
  conversion is corrected. Trade quotations must match the trade, cancel batches must have a
  valid size, and frontend trade prices serialize as unsigned WAD integer strings.
- RPC order books and frontend depth charts share exact bigint depth traversal. Empty
  liquidity yields empty chart sides, and invalid chart pagination is rejected.
- Automatic HTTP retries apply only to read-only requests.
- HTTP responses with a non-zero `code` throw a `SynfError` carrying the server `msg`
  instead of resolving to empty data, and HTTP error messages read the server `msg` field.
- HTTP order books read the server's `baseSize` into `baseQuantity`, which was previously
  always undefined, and decode `null` sides as empty. The on-chain context query keeps raw
  integers that the server sends as JSON numbers exact instead of rounding them. A market
  without a beacon no longer fails instrument decoding. Market pair info sends the
  `instrument` parameter, and the portfolio list uses `/v4/public/market/portfolio`. Portfolio
  lists decode the server's single position object, treat its empty struct as no position and
  read `null` lists as empty, so the on-chain context no longer fails for a trader without
  portfolios. Instrument feeder sources and AMMs, depth tick ids and gate and MM wallet
  portfolios also read `null` as empty. A non-JSON error page on the on-chain context query
  stays an HTTP error, so it is retried and reports its status.
- History responses reject unknown `typeString` and `side` values.
- A topic whose WebSocket SUBSCRIBE the server rejects is subscribed again by the next
  subscribe call or reconnect.
