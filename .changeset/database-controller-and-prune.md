---
'@dudousxd/nestjs-notifications-database': minor
---

Auto-mount the inbox REST controller from `DatabaseChannelModule.forRoot({ controller })` (default true; pass `false` to mount it yourself, or `{ resolveRef }` to customize). Add a configurable scheduled `prune` (`forRoot({ prune: { olderThan, every?, onlyRead?, runOnStartup? } })`) backed by a new optional `NotificationStore.prune()` method (implemented for the in-memory store).
