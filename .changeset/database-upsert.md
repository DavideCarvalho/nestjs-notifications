---
'@dudousxd/nestjs-notifications-database': minor
---

Support updatable "live"/progress notifications: a notification can return a stable `databaseKey(notifiable)` and the database channel upserts that row in place across sends (updating data and resetting read state) instead of inserting a new one. Backed by a new optional `NotificationStore.upsert()` (implemented for the in-memory store).
