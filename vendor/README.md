# Local SDK dependency

`derivation-tech-viem-kit-1.0.0-rc.3.tgz` is packed from the viem-kit
`refactor/viem-kit-core-hardening` branch at commit
`d4c975687bf6f653235a66bfd09b94788a166607`. The package version in the archive is set to `1.0.0-rc.3`.

SHA-256: `18a7374a248c2e82d3efb764cbf64bd6d2757daea8e3a3023940f59e9fd0c0ab`.

When viem-kit changes, rebuild the archive from a committed revision and update the
revision and SHA-256 above. Ledger remains a separately installed optional package; its
device dependencies are not included.

This unpublished dependency is pinned for reproducible local and CI validation.
Before publishing PerpV3, replace the workspace override and catalog version with the
released viem-kit version and regenerate the lockfile. `prepublishOnly` rejects the
local override and any direct `link:` or `file:` viem-kit dependency.

For local development against a viem-kit checkout, point the override at
`link:<absolute path>/packages/viem-kit` and run `pnpm install`. Do not commit that override.
