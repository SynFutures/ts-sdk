---
'@synfutures/airdrop': patch
'@synfutures/oyster-governance': patch
'@synfutures/oyster-governance-data-source': patch
'@synfutures/governance-sdk': patch
---

Install the governance and airdrop packages without the legacy web3-core dependency tree.
Existing v5 hosts can supply their matching web3-core instance. The plugins retain their v5
contract bindings, BigNumber results, and host types. The subgraph reader installs no wallet
or provider implementation.

The standalone governance SDK keeps the v5 signer, gas policy, provider and deep imports.
Its WebSocket transport uses a patched ws 8 release. The transaction-capable packages still
depend on elliptic 6.6.1 through ethers v5.
