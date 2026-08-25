export { NotificationEntity } from './notification.entity';
export { NotificationRepository } from './notification.repository';
export {
  MikroOrmNotificationStore,
  notificationsManagedTables,
} from './mikro-orm-notification.store';
export { MikroOrmNotificationStoreModule } from './mikro-orm-notification-store.module';
export { notificationsSchemaSql, ensureNotificationsTable } from './schema';

// --- Pending-digest store (digest feature) ---
export { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
export { DigestWindowRepository, PendingDigestRepository } from './pending-digest.repository';
export { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
export { MikroOrmPendingDigestStoreModule } from './mikro-orm-pending-digest-store.module';
export { pendingDigestSchemaSql, ensurePendingDigestTables } from './pending-digest.schema';
