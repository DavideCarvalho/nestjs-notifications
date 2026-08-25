---
'@dudousxd/nestjs-notifications-database-mikro-orm': minor
---

Inject a notification repository by type, instead of passing the entity to `em.find()`.

Reaching a stored notification meant asking for the `EntityManager` and naming the entity at every
call site — `em.find(NotificationEntity, ...)` — so the entity had to be imported everywhere and no
query had a home to live in.

Each entity now declares a custom repository, and `MikroOrmModule.forFeature([...])` — which
`MikroOrmNotificationStoreModule.forFeature()` and `MikroOrmPendingDigestStoreModule.forFeature()`
already call — registers the class as its own DI token. Importing either module is enough; hosts
change nothing else.

```ts
constructor(private readonly notifications: NotificationRepository) {}

const unread = await this.notifications.find({ readAt: null });
```

- **`NotificationRepository`** — `notifications`
- **`PendingDigestRepository`** — `notification_pending_digests`
- **`DigestWindowRepository`** — `notification_digest_windows`

All three are exported from the package root and from the `exports` of the module that registers
them. `EntityManager` keeps working exactly as before, and the schema fingerprint is unchanged — a
custom repository is not part of the table shape, so no consumer is pushed into a schema self-heal.
