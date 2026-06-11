---
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-database-typeorm": minor
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
"@dudousxd/nestjs-notifications-database-prisma": minor
"@dudousxd/nestjs-notifications-testing": minor
"@dudousxd/nestjs-notifications-event-emitter": patch
"@dudousxd/nestjs-notifications-bullmq": patch
"@dudousxd/nestjs-notifications-redis": patch
---

Multi-tenancy + use NestJS's own `@Inject` for service injection.

**Multi-tenancy** (the same user can live in many workspaces — each with an isolated feed):

- `notifications.forTenant(id)` / `forTenants([...])` scope a send to one or many tenants; a
  `@Tenant()` property on the notification (or notifiable) infers it, and may be a `string` or
  `string[]` (the send fans out to each tenant, one delivery + storage row per tenant).
- The database channel stores a `tenantId` (column auto-created); the read API scopes by it:
  `notificationsQuery.forTenant(id).unread(user)`. TypeORM / MikroORM / Prisma adapters all carry
  `tenantId` and filter by it (undefined = all tenants). `SendResult` carries the `tenant`.
- The tenant is threaded through the sync, event-emitter, BullMQ and Redis dispatchers, and is
  available to channels via the new `DeliveryContext` (3rd arg of `ChannelDriver.send`).

**BREAKING (0.x): `@InjectService` removed.** Use NestJS's own `@Inject(TOKEN)` on a notification
property — the library populates it from the container at delivery time by reading Nest's
`PROPERTY_DEPS_METADATA`. One documented primitive instead of a custom decorator.
