import { describe } from 'vitest';

/**
 * FLAGGED — the Prisma adapter is intentionally NOT in the cross-store contract / DB matrix.
 *
 * Unlike the TypeORM and MikroORM adapters (which own their entities + a non-destructive
 * `ensureSchema()` and so can stand up their own schema against a fresh testcontainers engine), the
 * Prisma adapter is **schema-first and consumer-owned**: it ships only the structural
 * `PrismaNotificationClientLike` interface and a documented `Notification` model shape. It has no
 * `schema.prisma`, no migrations, and its `ensureSchema()` is a deliberate no-op (Prisma manages
 * its own schema via `prisma migrate` / `prisma db push`).
 *
 * Running the real contract against Postgres/MySQL would therefore require heavy, consumer-style
 * setup that lives outside this package:
 *   1. add the `prisma` CLI as a dev dependency (only `@prisma/client` is present today),
 *   2. author a dialect-specific `schema.prisma` (the datasource provider is baked into a generated
 *      client, so PG and MySQL each need their own `prisma generate`),
 *   3. point the datasource at the testcontainers URL and run `prisma migrate deploy` / `db push`
 *      before the suite, per dialect.
 *
 * Per the task's guidance ("a store that can't run under testcontainers without heavy setup → FLAG,
 * don't fake"), we do NOT back it with an in-memory fake here — that would only re-exercise the
 * in-memory logic and give false confidence about real SQL. The store's mapping/query-shape logic
 * is already covered by the mocked unit tests in `prisma-notification.store.spec.ts`.
 *
 * To close this gap, add a `prisma generate` + `prisma migrate` step in a `*.db.spec.ts` here and
 * reuse `runNotificationStoreContract` from `test-contracts/notification-store.contract.ts`.
 */
describe.skip('PrismaNotificationStore contract (FLAGGED — needs prisma generate + migrate)', () => {});
