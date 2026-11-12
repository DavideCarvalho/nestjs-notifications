export { NotificationEntity, notificationEntity } from './notification.entity';
export { NotificationRepository } from './notification.repository';
export {
  MikroOrmNotificationStore,
  type MikroOrmNotificationStoreOptions,
  notificationsManagedTables,
} from './mikro-orm-notification.store';
export { MikroOrmNotificationStoreModule } from './mikro-orm-notification-store.module';
export {
  notificationsSchemaSql,
  ensureNotificationsTable,
  type NotificationsSchemaOptions,
} from './schema';
export { MIKRO_ORM_NOTIFICATIONS_OPTIONS } from './schema-name';

// --- Pending-digest store (digest feature) ---
export {
  DigestWindowEntity,
  PendingDigestEntity,
  digestWindowEntity,
  pendingDigestEntity,
} from './pending-digest.entity';
export { DigestWindowRepository, PendingDigestRepository } from './pending-digest.repository';
export { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
export { MikroOrmPendingDigestStoreModule } from './mikro-orm-pending-digest-store.module';
export { pendingDigestSchemaSql, ensurePendingDigestTables } from './pending-digest.schema';
