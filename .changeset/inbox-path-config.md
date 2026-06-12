---
'@dudousxd/nestjs-notifications-database': minor
'@dudousxd/nestjs-notifications-codegen': minor
---

Make the inbox base path configurable, so the API can avoid colliding with a `/notifications` page route under a shared global prefix.

- database: `DatabaseChannelModule.forRoot({ controller: { path } })` (and `createNotificationsController({ path })`, already supported) mount the inbox at a custom base.
- codegen: `nestjsNotificationsCodegen({ path })` emits the inbox routes at that path (independent of `name`, the client namespace).

Keep the controller `path`, the codegen `path`, and the client `path` in sync.
