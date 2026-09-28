export {
  DEFAULT_TABLE_NAMES,
  createNotificationTables,
  notificationTables,
  notificationsManagedTables,
  notificationsSchemaDdl,
  pendingDigestSchemaDdl,
  type NotificationTableNames,
  type NotificationTables,
  type NotificationTablesOptions,
} from './schema';
export {
  DRIZZLE_NOTIFICATIONS_DB,
  DRIZZLE_NOTIFICATION_TABLES,
  type DrizzlePgDatabase,
} from './tokens';
export type { DrizzleStoreModuleAsyncOptions, DrizzleStoreModuleOptions } from './module-options';
export { DrizzleNotificationStore } from './drizzle-notification.store';
export { DrizzleNotificationStoreModule } from './drizzle-notification-store.module';

// --- Pending-digest store (digest feature) ---
export { DrizzlePendingDigestStore } from './drizzle-pending-digest.store';
export { DrizzlePendingDigestStoreModule } from './drizzle-pending-digest-store.module';
