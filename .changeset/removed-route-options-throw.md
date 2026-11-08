---
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-sse": minor
"@dudousxd/nestjs-notifications-preferences": minor
"@dudousxd/nestjs-notifications-delivery-tracking": minor
---

Removed route-protection options now throw instead of being ignored. A `guards` option passed to `createNotificationsController`, `createNotificationsStreamController`, `createPreferenceCenterController`, `createSesNotificationController`, `createTwilioStatusController` or inside `DatabaseChannelModule`'s `controller`, and a boolean `controller` (`controller: false`), throw at registration with a pointer to `decorators` / `routes: false`. A JavaScript caller no longer gets an inbox that mounts again, or mounts without its guards.
