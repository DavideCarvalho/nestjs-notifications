---
"@dudousxd/nestjs-notifications-database": patch
"@dudousxd/nestjs-notifications-delivery-tracking": patch
"@dudousxd/nestjs-notifications-telescope": patch
---

Derive the notification's display/persistence name via core's instance-aware `notificationName()`
helper instead of inline class-level lookups. Completes the `notificationType?()` feature from
core 0.9.0: `DatabaseChannel` now persists the instance-level type to the `type` column (what the
inbox `?type=` filter matches), and delivery-tracking / the Telescope watcher label entries with
it. Classes without `notificationType()` behave exactly as before.
