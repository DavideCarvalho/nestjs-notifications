---
"@dudousxd/nestjs-notifications-preferences": minor
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-database-typeorm": minor
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
"@dudousxd/nestjs-notifications-database-prisma": minor
"@dudousxd/nestjs-notifications-database-drizzle": minor
---

Per-recipient digests and a COUNT-based unread count.

- **preferences**: `PendingDigestStore.listGroups(cadence, filter?)` takes an optional `PendingDigestGroupFilter` (`{ notifiable?: NotifiableRef; tenantId?: string | null }`) to read one recipient's (and/or one tenant's) pending digest; omitted = unchanged behaviour. New `DigestCollector.flushDigestsFor(notifiable, cadence, { tenantId?, now? })` flushes just that recipient's groups — same dispatch / quiet-hours / clear logic as `flushDigests`, but without the global window lock, for apps that run digests on a per-recipient schedule.
- **database**: optional `NotificationStore.countUnread(notifiableType, notifiableId, tenantId?, types?)`; `NotificationsQueryService.unreadCount` prefers it and falls back to `getUnread().length`.
- **database-typeorm / -mikro-orm / -prisma / -drizzle**: implement `countUnread` (a `COUNT` query) and the `listGroups` filter (pushed into the `WHERE` clause).
- **database-typeorm / -mikro-orm / -prisma**: the notification-store and pending-digest-store modules are now `global` (like Drizzle's), so the documented sibling pairings — `XNotificationStoreModule.forFeature()` + `DatabaseChannelModule.forFeature()`, and `XPendingDigestStoreModule` + `PreferencesModule.forDigest({ store })` — resolve. They also re-export what the store needs (TypeORM repositories, the Prisma client token when bound inline).
- **database-mikro-orm**: fix `MikroOrmNotificationStoreModule.forFeature()` / `MikroOrmPendingDigestStoreModule.forFeature()` failing at boot ("Nest cannot export a provider/module that is not a part of the currently processed module") — the custom repositories are now exported by re-exporting the `MikroOrmModule.forFeature()` module.
