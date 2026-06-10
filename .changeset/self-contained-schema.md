---
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-database-typeorm": minor
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
"@dudousxd/nestjs-notifications-database-prisma": patch
---

Self-contained schema: the database channel creates its table on its own.

- `DatabaseChannelModule.forRoot/forFeature({ autoCreateSchema })` — defaults to **true**. On
  bootstrap the store's `ensureSchema()` creates the `notifications` table (and any missing
  columns) **non-destructively** (never drops). Set `false` to manage the schema via migrations.
- `NotificationStore.ensureSchema?()` is now part of the interface; the TypeORM and MikroORM
  stores implement it using their own schema diff (so it's driver-portable). Prisma defers to
  `prisma migrate` (no-op + log).
- Migration helpers for the migrations-controlled path:
  - TypeORM: `createNotificationsTable(queryRunner)` / `ensureNotificationsTable(dataSource)`.
  - MikroORM: `notificationsSchemaSql(em)` (for `this.addSql(...)`) / `ensureNotificationsTable(em)`.

Real-SQLite integration tests cover create-on-demand and idempotency for both adapters.
