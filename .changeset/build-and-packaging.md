---
'@synfutures/perpv3-ts': patch
---

Build ESM and CommonJS bundles and declarations with tsdown and TypeScript 6. All public
entry paths are preserved, CommonJS declaration exports are corrected, and released tarballs
are installed in an empty npm project and checked with ESM, CommonJS, browser and type-level
consumers. Update viem to 2.58.7, Axios to 1.21.1 and the optional ws peer to ^8.23.0.
Expiry formatting uses native UTC dates and no longer requires date-fns or date-fns-tz.
