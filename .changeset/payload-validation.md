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
  chain, instrument or expiry than the message, instead of silently dropping that item.
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
