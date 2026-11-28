---
'@synfutures/perpv3-ts': patch
---

Honor a caller-supplied HTTP client in `fetchFuturesInstrumentInquireByNotional`. Calls that omit the client continue using the default API endpoint.
