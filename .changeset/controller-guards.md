---
'@dudousxd/nestjs-notifications-database': minor
'@dudousxd/nestjs-notifications-sse': minor
'@dudousxd/nestjs-notifications-preferences': minor
---

The controller factories (`createNotificationsController`, `createNotificationsStreamController`, `createPreferenceCenterController`) accept `guards` (applied via `@UseGuards`) and a custom `path`. The inbox/preferences/stream are per-user, so apps can now protect the auto-mounted endpoints with their auth guard.
