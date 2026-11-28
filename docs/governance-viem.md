# Migrating governance and airdrop clients to viem

Applications that still register ethers v5 plugins should keep their installed pre-major package versions pinned in their manifest and lockfile. Upgrade each application when it can supply a viem public client, use native bigint and send its own transactions. Remove the old host registration and update deep imports in the same application change.

| Previous usage                                            | Major-version replacement                                                                                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Airdrop plugin, signer-first claim                        | `createAirdropClient(publicClient)`, then `isClaimed(index)` or `buildClaim({ index, account, amount, proof })`                                                                     |
| Oyster governance plugin                                  | `createOysterGovernanceClient(publicClient)` from `@synfutures/oyster-governance`                                                                                                   |
| `GovClient.getInstance(chain)` and `setProvider`          | `createGovernanceClient(publicClient)` from `@synfutures/governance-sdk`                                                                                                            |
| Governance data-source plugin                             | `new GovernanceDataSource(graphUrl)` from `@synfutures/oyster-governance-data-source`                                                                                               |
| Provider, gas multiplier and optional TGE configuration   | `createTgeClient(publicClient, { vault, multicall, graphUrl })` from `@synfutures/governance-sdk/tge`; pass `gasMultiplier` to `estimateRequest`                                    |
| TypeChain factories, `build/*` imports and ethers parsers | Import typed ABIs from the package root, then use viem's `getContract`, `decodeFunctionData` or `decodeEventLog`. Import TGE through the public `/tge` subpath in ESM and CommonJS. |

## Choose the deployment

Oyster governance and the independent governance SDK select different contracts on Ethereum. Keep the same package entry when migrating. Their `accountStakeInfo` ABIs also differ in the balance width (Oyster uses `uint128`, the independent SDK uses `uint256`).

| Entry                      | Chain                | Default contract                                                                                                        |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Airdrop                    | Ethereum             | Distributor `0xAeACfdb15284bDf93155C3616CC4a65C2C93EdFC`                                                                |
| Airdrop                    | Base                 | Distributor `0x2e28798f592392B1A1A735D405D43DDF327634F2`                                                                |
| Oyster governance          | Ethereum             | Vault `0x93432aFf5A44865Bd2cfC028C147AE1D0094cf05`, token `0x6e15A54B5EcAc17e58daDedDbe8506a7560252F9`                  |
| Oyster governance          | Base                 | Token `0x2C24497D4086490e7EaD87CC12597fb50c2E6eD6`. Supply the vault explicitly for staking.                            |
| Independent governance SDK | Ethereum and Sepolia | Vault `0xB02585D7d561Cf3469CCDC4447a63C3F4dB8d7D8`, token `0x91DcdBa5032657D5573036fEf15724deF8CD2316`                  |
| Governance SDK `/tge`      | Caller-selected      | Supply a distributor for each claim. Supply `vault`, `multicall` and `graphUrl` together to enable staking and history. |

Both root staking clients default to Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11`. Select the chain when creating the public client, or pass explicit contract addresses. Select the subgraph URL for the same deployment.

## Port a staking transaction

```ts
import { createPublicClient, http, parseUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { createOysterGovernanceClient } from '@synfutures/oyster-governance';

const publicClient = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
const governance = createOysterGovernanceClient(publicClient);
const position = await governance.getStakingInfo(account, { blockNumber });
const request = governance.buildStake(parseUnits('1.25', 18));
const hash = await walletClient.sendTransaction({ ...request, account, chain: mainnet });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

Supply your RPC URL, wallet client, account and block number. Builders produce unsigned `{ to, data }` offline. Your application chooses the sender, gas policy, confirmation count and how to handle a reverted receipt. Use the original contract index in `position.pendingUnstakes[i].index` for `buildRelease`; the display list is sorted by creation time.

Use `getTotalStaking({ blockNumber })` on the staking client in place of `stakingVault.totalStaking()`. On a TGE client configured for staking, call `tge.governance.getTotalStaking()` for the latest total. Both return a bigint in the staking token's base units.

Use bigint for raw token amounts, block numbers, claim and release indices. Format values for display with `formatUnits`. Convert bigints to decimal strings at JSON boundaries. Voting-power and boost simulations accept named stake changes and use Unix seconds for `lastUnstakeTime` and `now`. A subgraph event's `timestamp` and `logIndex` remain numbers.

## Port a TGE claim

```ts
import { createTgeClient } from '@synfutures/governance-sdk/tge';

const tge = createTgeClient(publicClient);
const claimed = await tge.airdrop.isClaimed(distributor, index, { blockNumber });
if (!claimed) {
    const request = tge.airdrop.buildClaim({ distributor, index, account: beneficiary, amount, proof });
    const estimated = await tge.estimateRequest(request, { account: sender, gasMultiplier: 1.7 });
    const hash = await walletClient.sendTransaction({ ...estimated, account: sender, chain });
    await publicClient.waitForTransactionReceipt({ hash });
}
```

Use the Merkle leaf's beneficiary and raw amount. The sender can differ from the beneficiary. To use a fixed gas limit, pass `{ gas }` to `estimateRequest`.
