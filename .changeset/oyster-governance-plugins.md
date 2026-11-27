---
'@synfutures/airdrop': patch
'@synfutures/oyster-governance': patch
'@synfutures/oyster-governance-data-source': patch
---

Move the three ethers v5 Oyster plugins into this workspace. Preserve their package names, deep imports, contract bindings, and signer and provider integration. The airdrop plugin supports both chain-selected and explicitly supplied distributor addresses.
