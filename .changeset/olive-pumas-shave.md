---
'@dudousxd/nestjs-notifications-database': minor
'@dudousxd/nestjs-notifications-database-mikro-orm': minor
'@dudousxd/nestjs-notifications-database-prisma': minor
'@dudousxd/nestjs-notifications-database-typeorm': minor
---

Detect duplicate inbox mounts, and scope the inbox's per-id mutations to their owner.

`DatabaseChannelModule`'s `controller` option defaults to `true`, so `forRoot()` auto-mounts the
inbox even when the application also mounts its own via `createNotificationsController()`. Apps have
shipped believing that passing their own controller replaced the default one; instead they got two,
with the auto-mounted duplicate sitting on the default `notifications` path — shadowing an unrelated
page route served there, and carrying the module's `resolveRef` and guards rather than the ones on
the hand-mounted controller.

The default is unchanged. What changes is that the situation is no longer silent:

- **Duplicate-mount warning.** A new `InboxMountAudit` provider (registered by both `forRoot()` and
  `forFeature()`) warns at `onApplicationBootstrap` when the inbox was both auto-mounted and
  hand-mounted, naming every path involved and pointing at `controller: false`. It runs at bootstrap
  rather than at module-construction time so it doesn't depend on module evaluation order.
- **The `controller` option's docs** now state outright that mounting your own does not disable the
  auto-mount.

**Ownership enforcement (behavior change).** `POST /notifications/:id/read` and
`DELETE /notifications/:id` previously acted on any notification id, ignoring who was asking —
`DELETE` never even resolved the current notifiable. Both now scope the mutation to the caller and
respond `404` (not `403`, which would reveal which ids exist) for a notification belonging to
someone else. Correct clients are unaffected.

`NotificationStore` gains three **optional** methods, so existing stores keep compiling:

- `deleteOwned(id, owner)` and `markAsReadOwned(id, owner)` — preferred; the ownership predicate
  goes into the query, so there is no read-then-write window.
- `findById(id)` — the fallback, used when the scoped mutations are absent.

All four bundled stores implement all three. A custom store implementing none of them cannot verify
ownership; the query service logs a warning naming the store instead of silently skipping the check.
`NotificationsQueryService.delete(id)` / `markAsRead(id)` called *without* a target remain unscoped,
so programmatic callers acting outside a request are unaffected. `forTenant(t)` now carries its
tenant into the ownership check, which `forTenant(t).delete(id)` previously dropped.
