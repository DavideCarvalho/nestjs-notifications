---
'@dudousxd/nestjs-notifications-core': minor
---

Add ad-hoc channel filtering to sends — `notifications.only([...])` / `notifications.except([...])`, composable with `forTenant`. Enrich the `notification.sent` / `notification.failed` events with the tenant, delivery duration (ms), and the channel's response.
