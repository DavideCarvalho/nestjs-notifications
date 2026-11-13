---
"@dudousxd/nestjs-notifications-database-drizzle": minor
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
"@dudousxd/nestjs-notifications-database-typeorm": minor
"@dudousxd/nestjs-notifications-database-prisma": minor
---

Keep the library's tables in a database schema of their own (on MySQL, a database) with a `schema` option. Every statement names the schema; `search_path` is never used. The schema is created at boot when it's missing, and SQLite with `schema` fails at boot. Without `schema`, nothing changes.

- **TypeORM / MikroORM:** `TypeOrmNotificationStoreModule.forFeature({ schema })`, `TypeOrmPendingDigestStoreModule.forFeature({ schema })` (same for MikroORM), with `notificationEntity({ schema })`, `pendingDigestEntity({ schema })` and `digestWindowEntity({ schema })` to register in the ORM. The migration helpers and `notificationsManagedTables` take `{ schema }` too. MikroORM keeps its schema marker table in the schema and takes a per-schema heal lock.
- **Drizzle:** the store modules take `schema` as shorthand for `tables: createNotificationTables({ schema })`. `'public'` is refused with a clear message, and the schema is created only when missing.
- **Prisma:** the store runs no SQL of its own; the docs show the `@@schema` setup.
