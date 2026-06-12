---
'@dudousxd/nestjs-notifications-client': minor
---

`createNotificationsClient` accepts a `path` option (default `'notifications'`) — the resource segment appended to `baseUrl`. Set it when the host mounts `createNotificationsController({ path })` at a non-default path (e.g. to avoid colliding with a `/notifications` page route under a shared global prefix).
