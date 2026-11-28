# SynFutures airdrop

Pass a viem public client to `createAirdropClient(publicClient)`. Ethereum and Base retain their existing default distributors. Pass an explicit distributor for another deployment. `isClaimed(index, { blockNumber })` reads at the requested block.

```ts
const airdrop = createAirdropClient(publicClient);
const request = airdrop.buildClaim({ index, amount, account: beneficiary, proof });
const hash = await walletClient.sendTransaction({ ...request, account: sender, chain });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

Indices and raw token amounts are bigint. Building a claim is offline. The exported `airdropAbi` supports viem event, error and calldata decoding. Older Oyster hosts should pin the pre-major release.
