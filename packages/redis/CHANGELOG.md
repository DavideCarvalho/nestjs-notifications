# @dudousxd/nestjs-notifications-redis

## 0.3.0

### Minor Changes

- 851170c: Carry the captured trigger context across the worker boundary. The job payload now includes the `captured` context (JSON-safe), and the BullMQ processor / Redis worker re-establish it on the channel runner — so an async-delivered notification still records WHO triggered it (causer/tenant/trace). The serialization carrier is provided by core; this just rehydrates it.

## 0.2.2

### Patch Changes

- 88aa12f: Multi-tenancy + use NestJS's own `@Inject` for service injection.

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

## 0.2.1

### Patch Changes

- db1e3f0: Honor a notification's `delay` in the async dispatchers: BullMQ schedules the job natively,
  while the in-process event-emitter and Redis dispatchers defer with a timer.
