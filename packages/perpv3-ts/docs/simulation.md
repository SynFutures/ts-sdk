# Simulation inputs and units

Simulation consumes a `PairSnapshot`, explicit user settings and, where required,
a quotation. It computes contract parameters and a predicted result without
sending a transaction. See the [quick start](../README.md#simulate-a-trade) for a
complete trade example.

| Input                                           | Purpose                                                        |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `TradeInput`                                    | market trade or close simulation with a size-matched quotation |
| `PlaceInput`                                    | limit order placement                                          |
| `CrossLimitOrderInput`, `ScaledLimitOrderInput` | composite limit order strategies                               |
| `AddInput`, `RemoveInput`                       | range liquidity changes                                        |
| `AdjustInput`                                   | margin and leverage adjustments                                |

The exported constructor and `simulate` signatures are the reference for each
input's required snapshot, quotation and settings. Do not reuse a quotation for
a different signed size or combine unrelated snapshot heights.

## Units and validation

Contract amounts and exact arithmetic use `bigint`. Simulation size, prices and
ratios use the units specified by their types, frequently 18-decimal WAD. Token
transfers use the token's native decimals. Convert explicitly at the boundary;
do not pass a display number or assume a six-decimal token uses WAD on-chain.

`Side` expresses direction; signed size is positive for long and negative for
short. `PERP_EXPIRY` selects perpetuals; dated futures use their expiry timestamp.
`UserSetting` owns deadline, slippage, leverage and mark-price buffer choices.
Input and snapshot validation reports invalid parameters or simulation failures.
A successful simulation does not establish current allowance, wallet balance or
execution success after state changes.

## From simulation to execution

Use the encoders from `/utils` to pack simulation parameters, then the typed
request builders from `/frontend` to select the contract method and arguments.
Instrument, gate, router and token builders keep each ABI's write methods and
argument tuples. Calldata encoders depend on function name and arguments, without
requiring unrelated transaction-envelope fields.

`contractCallEncoder` builds account, instrument and token transaction parameters
for frontend consumers. Relay options require the corresponding trader/router
addresses. Keep sender, beneficiary and target contract distinct.
See [transaction execution](transactions.md) for receipt and diagnostic handling.
