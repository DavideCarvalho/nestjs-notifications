/**
 * Structural typings + DI token for the Prisma client consumed by
 * {@link PrismaPendingDigestStore} (the digest feature's persistent adapter).
 *
 * Like {@link PrismaNotificationStore}, the adapter deliberately does NOT import a generated
 * `@prisma/client` type. Instead it depends on a minimal structural interface describing only the
 * `PendingDigest` + `DigestWindow` model delegate methods it uses. This keeps the package free of
 * any `prisma generate` step and decoupled from the consumer's generated client location/version.
 *
 * ## Required Prisma schema
 *
 * The consumer's `schema.prisma` must declare two models shaped like:
 *
 * ```prisma
 * model PendingDigest {
 *   id               String   @id
 *   cadence          String
 *   notifiableType   String
 *   notifiableId     String
 *   tenantId         String?
 *   category         String
 *   notificationName String
 *   notificationData Json
 *   createdAt        DateTime @default(now())
 *
 *   // Backs the collector's grouped read.
 *   @@index([cadence, tenantId, notifiableType, notifiableId, category])
 * }
 *
 * model DigestWindow {
 *   // `${cadence}:${windowKey}` — the unique key that makes a flush window run at most once.
 *   id    String   @id
 *   ranAt DateTime @default(now())
 * }
 * ```
 *
 * A real `PrismaClient` instance structurally satisfies {@link PrismaPendingDigestClientLike}, so
 * you can inject it directly.
 *
 * ## Idempotency note
 *
 * {@link PrismaPendingDigestStore.tryLockWindow} relies on the `DigestWindow` `@id` being unique: a
 * second `create` for the same `${cadence}:${windowKey}` rejects with a unique-constraint error,
 * which the store treats as "window already ran" (returns `false`). This matches the TypeORM /
 * MikroORM adapters.
 */

/** Minimal structural view of a Prisma `PendingDigest` model delegate. */
export interface PrismaPendingDigestDelegate {
  create(args: { data: any }): Promise<any>;
  findMany(args: { where: any; orderBy?: any }): Promise<any[]>;
  deleteMany(args: { where: any }): Promise<{ count: number }>;
}

/** Minimal structural view of a Prisma `DigestWindow` model delegate. */
export interface PrismaDigestWindowDelegate {
  create(args: { data: any }): Promise<any>;
}

/** Minimal structural view of a Prisma client exposing the digest models. */
export interface PrismaPendingDigestClientLike {
  pendingDigest: PrismaPendingDigestDelegate;
  digestWindow: PrismaDigestWindowDelegate;
}

/**
 * DI token for the app-provided Prisma client ({@link PrismaPendingDigestClientLike}) injected into
 * {@link PrismaPendingDigestStore}.
 */
export const PRISMA_PENDING_DIGEST_CLIENT = Symbol('PRISMA_PENDING_DIGEST_CLIENT');
