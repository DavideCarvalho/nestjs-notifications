/** DI token for the {@link NotificationStore} implementation backing the database channel. */
export const NOTIFICATION_STORE = Symbol('NOTIFICATION_STORE');

/** DI token for the `autoCreateSchema` flag consumed by the SchemaInitializer. */
export const AUTO_CREATE_SCHEMA = Symbol('AUTO_CREATE_SCHEMA');

/** DI token for the {@link import('./notification-pruner').PruneOptions} (or null when disabled). */
export const PRUNE_OPTIONS = Symbol('PRUNE_OPTIONS');
