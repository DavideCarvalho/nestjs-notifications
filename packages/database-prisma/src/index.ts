export {
  PRISMA_CLIENT,
  type PrismaNotificationClientLike,
  type PrismaNotificationDelegate,
} from './prisma-client';
export { PrismaNotificationStore } from './prisma-notification.store';
export {
  PrismaNotificationStoreModule,
  type PrismaNotificationStoreOptions,
} from './prisma-notification-store.module';

// --- Pending-digest store (digest feature) ---
export {
  PRISMA_PENDING_DIGEST_CLIENT,
  type PrismaPendingDigestClientLike,
  type PrismaPendingDigestDelegate,
  type PrismaDigestWindowDelegate,
} from './prisma-pending-digest-client';
export { PrismaPendingDigestStore } from './prisma-pending-digest.store';
export {
  PrismaPendingDigestStoreModule,
  type PrismaPendingDigestStoreOptions,
} from './prisma-pending-digest-store.module';
