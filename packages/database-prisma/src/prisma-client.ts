/**
 * Structural typings + DI token for the Prisma client consumed by
 * {@link PrismaNotificationStore}.
 *
 * The adapter deliberately does NOT import a generated `@prisma/client` type.
 * Instead it depends on a minimal structural interface describing only the
 * `Notification` model delegate methods it uses. This keeps the package free of
 * any `prisma generate` step and decouples it from the consumer's generated
 * client location/version.
 *
 * ## Required Prisma schema
 *
 * The consumer's `schema.prisma` must declare a `Notification` model shaped like:
 *
 * ```prisma
 * model Notification {
 *   id             String    @id
 *   type           String
 *   notifiableType String
 *   notifiableId   String
 *   tenantId       String?
 *   data           Json
 *   readAt         DateTime?
 *   createdAt      DateTime  @default(now())
 *   updatedAt      DateTime  @updatedAt
 *
 *   // An index on the tenant + notifiable lookup keys is wise for scoped reads.
 *   @@index([tenantId, notifiableType, notifiableId])
 * }
 * ```
 *
 * A real `PrismaClient` instance structurally satisfies
 * {@link PrismaNotificationClientLike}, so you can inject it directly.
 */

/** Minimal structural view of a Prisma `Notification` model delegate. */
export interface PrismaNotificationDelegate {
  create(args: { data: any }): Promise<any>;
  update(args: { where: any; data: any }): Promise<any>;
  updateMany(args: { where: any; data: any }): Promise<any>;
  findMany(args: { where: any; orderBy?: any }): Promise<any[]>;
  delete(args: { where: any }): Promise<any>;
}

/** Minimal structural view of a Prisma client exposing the `notification` model. */
export interface PrismaNotificationClientLike {
  notification: PrismaNotificationDelegate;
}

/**
 * DI token for the app-provided Prisma client
 * ({@link PrismaNotificationClientLike}) injected into
 * {@link PrismaNotificationStore}.
 */
export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
