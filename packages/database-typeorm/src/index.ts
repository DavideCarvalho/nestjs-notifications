export { NotificationEntity } from './notification.entity';
export { TypeOrmNotificationStore } from './typeorm-notification.store';
export { TypeOrmNotificationStoreModule } from './typeorm-notification-store.module';
export {
  createNotificationsTable,
  ensureNotificationsTable,
  notificationsManagedTables,
} from './schema';

// --- Pending-digest store (digest feature) ---
export { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
export { TypeOrmPendingDigestStore } from './typeorm-pending-digest.store';
export { TypeOrmPendingDigestStoreModule } from './typeorm-pending-digest-store.module';
export {
  createPendingDigestTables,
  ensurePendingDigestTables,
} from './pending-digest.schema';
