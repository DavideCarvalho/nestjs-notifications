import { describe } from 'vitest';

/**
 * FLAGGED — the Prisma pending-digest adapter is intentionally NOT in the cross-store contract / DB
 * matrix, for the same reason as {@link PrismaNotificationStore} (see
 * `prisma-notification.store.contract.spec.ts`).
 *
 * The Prisma adapter is schema-first and consumer-owned: it ships only the structural
 * `PrismaPendingDigestClientLike` interface and a documented `PendingDigest` + `DigestWindow` model
 * shape. It has no `schema.prisma`, no migrations, and its `ensureSchema()` is a deliberate no-op
 * (Prisma manages its own schema via `prisma migrate` / `prisma db push`).
 *
 * Running the real `runPendingDigestStoreContract` against Postgres/MySQL would require consumer-
 * style setup (the `prisma` CLI, a dialect-specific `schema.prisma`, `prisma generate` +
 * `prisma migrate deploy` per dialect) that lives outside this package. Per the task's guidance
 * ("a store that can't run under testcontainers without heavy setup → FLAG, don't fake"), we do NOT
 * back it with an in-memory fake here — the store's mapping/query-shape + idempotency logic is
 * covered by the mocked unit tests in `prisma-pending-digest.store.spec.ts`.
 *
 * To close this gap, add a `prisma generate` + `prisma migrate` step in a `*.db.spec.ts` here and
 * reuse `runPendingDigestStoreContract` from `test-contracts/pending-digest-store.contract.ts`.
 */
describe.skip('PrismaPendingDigestStore contract (FLAGGED — needs prisma generate + migrate)', () => {});
