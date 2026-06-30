---
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
---

Gate `MikroOrmNotificationStore.ensureSchema()` behind a schema fingerprint so steady-state boots skip the whole-DB `information_schema` introspection.

On boot the store now idempotently creates a `notifications_schema_meta` marker table (no introspection, empty-DB safe), computes the expected fingerprint purely from in-memory entity metadata (owned tables' columns/indexes + collation + platform + a hand-bump `SCHEMA_REVISION`), and compares it to the last-applied fingerprint. When they match it returns immediately, never calling `getUpdateSchemaSQL`. On drift (or first boot) it heals under a best-effort advisory lock (`GET_LOCK` on MySQL, `pg_advisory_lock` on Postgres, skipped on SQLite), re-checks in case a peer healed first, runs the existing non-destructive diff, then records the new fingerprint. The non-destructive statement filtering and the `SchemaInitializer` `autoCreateSchema` short-circuit are unchanged.
