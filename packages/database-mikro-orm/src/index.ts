export { NotificationEntity } from './notification.entity';
export { MikroOrmNotificationStore } from './mikro-orm-notification.store';
export { MikroOrmNotificationStoreModule } from './mikro-orm-notification-store.module';
export { notificationsSchemaSql, ensureNotificationsTable } from './schema';

// --- Pending-digest store (digest feature) ---
export { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
export { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
export { MikroOrmPendingDigestStoreModule } from './mikro-orm-pending-digest-store.module';
export { pendingDigestSchemaSql, ensurePendingDigestTables } from './pending-digest.schema';
