---
"@dudousxd/nestjs-notifications-core": patch
---

perf: cache reflect-metadata per notification class — `WeakMap`-cache the channel handler map, the `@Inject` dependency list (with an empty no-op fast path), and the tenant field key. The dynamic `via()` path and per-instance tenant value resolution are unchanged.
