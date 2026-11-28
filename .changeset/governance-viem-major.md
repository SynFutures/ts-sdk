---
'@synfutures/airdrop': major
'@synfutures/oyster-governance': major
'@synfutures/oyster-governance-data-source': major
'@synfutures/governance-sdk': major
---

Migrate the four packages to viem. Replace ethers v5 plugin registration, signers, BigNumber and generated contract factories with standalone clients, typed ABIs, bigint amounts and unsigned transaction builders. The governance history reader takes a subgraph URL. The independent governance SDK exposes its root and `/tge` entry in both ESM and CommonJS. Each entry retains its original deployment selection and vault ABI.

Applications using a legacy host should pin their last working pre-major package versions. See the [migration guide](https://github.com/SynFutures/ts-sdk/blob/main/docs/governance-viem.md) for deployment addresses, API replacements and transaction examples.
