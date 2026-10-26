---
"@dudousxd/nestjs-notifications-core": patch
"@dudousxd/nestjs-notifications-bullmq": patch
"@dudousxd/nestjs-notifications-database": patch
"@dudousxd/nestjs-notifications-database-typeorm": minor
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
"@dudousxd/nestjs-notifications-database-drizzle": patch
"@dudousxd/nestjs-notifications-database-prisma": patch
"@dudousxd/nestjs-notifications-preferences": patch
"@dudousxd/nestjs-notifications-delivery-tracking": patch
---

Performance fixes for large sends and busy inboxes.

- A send to many recipients keeps at most 50 deliveries in flight instead of starting all of them at once. Async sends hand all their jobs to the dispatcher together: the new optional `DispatchDriver.dispatchMany`, which the BullMQ dispatcher implements with chunked `addBulk`.
- The in-memory idempotency store no longer walks its whole map on every reservation, and the in-memory throttle store evicts elapsed windows.
- `unreadCount()` runs a `COUNT` through the new optional `NotificationStore.countUnread`, implemented by the in-memory, TypeORM, MikroORM, Drizzle and Prisma stores.
- The TypeORM and MikroORM `notifications` tables get a `(notifiable_type, notifiable_id, created_at)` index, which `ensureSchema()` adds to existing tables.
- The preference-center gate reads a recipient's stored preferences once per delivery instead of once per channel.
- The digest collector reads pending groups a page at a time (new optional `PendingDigestStore.listGroupsPage`) and clears flushed entries in chunks. Every SQL `clear()` splits large id lists, so a backlog past the engine's bind-parameter limit is no longer left uncleared.
- The in-memory delivery-tracking store indexes provider message ids and keeps only the most recent 10,000 records.
- Quiet-hours evaluation reuses one `Intl.DateTimeFormat` per timezone.
