import { NOTIFICATION_STORE } from '@dudousxd/nestjs-notifications-database';
import { type DynamicModule, Module } from '@nestjs/common';
import { DrizzleNotificationStore } from './drizzle-notification.store';
import {
  type DrizzleStoreModuleAsyncOptions,
  type DrizzleStoreModuleOptions,
  asyncProviders,
  staticProviders,
} from './module-options';
import { DRIZZLE_NOTIFICATIONS_DB, DRIZZLE_NOTIFICATION_TABLES } from './tokens';

// Re-exported so a module that imports this one (e.g. `DatabaseChannelModule.forRoot({ store:
// DrizzleNotificationStore, imports: [...] })`) can construct the store too.
const TOKENS = [DRIZZLE_NOTIFICATIONS_DB, DRIZZLE_NOTIFICATION_TABLES];

const storeProviders = [
  DrizzleNotificationStore,
  { provide: NOTIFICATION_STORE, useExisting: DrizzleNotificationStore },
];

/**
 * Provides the Drizzle-backed notification store and binds it to the {@link NOTIFICATION_STORE}
 * token consumed by the database channel. Like Prisma, the Drizzle database is app-owned, so it
 * must be supplied: `forRoot({ db })`, `forRootAsync({ inject, useFactory })`, or `forFeature()`
 * when you already provide {@link DRIZZLE_NOTIFICATIONS_DB} from a shared module.
 *
 * Pair this with `DatabaseChannelModule.forFeature()` from
 * `@dudousxd/nestjs-notifications-database`:
 *
 * ```ts
 * @Module({
 *   imports: [
 *     DrizzleNotificationStoreModule.forRootAsync({ inject: [DB], useFactory: (db: Db) => ({ db }) }),
 *     DatabaseChannelModule.forFeature(),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
// Global so a SIBLING `DatabaseChannelModule.forFeature()` (a separate module that imports
// nothing) can resolve the store token — the documented pairing.
@Module({})
export class DrizzleNotificationStoreModule {
  static forRoot(options: DrizzleStoreModuleOptions): DynamicModule {
    return {
      module: DrizzleNotificationStoreModule,
      global: true,
      providers: [...staticProviders(options), ...storeProviders],
      exports: [DrizzleNotificationStore, NOTIFICATION_STORE, ...TOKENS],
    };
  }

  static forRootAsync(options: DrizzleStoreModuleAsyncOptions): DynamicModule {
    const { imports, providers } = asyncProviders(options);
    return {
      module: DrizzleNotificationStoreModule,
      global: true,
      imports,
      providers: [...providers, ...storeProviders],
      exports: [DrizzleNotificationStore, NOTIFICATION_STORE, ...TOKENS],
    };
  }

  /** Assumes {@link DRIZZLE_NOTIFICATIONS_DB} (and optionally the tables token) is provided elsewhere. */
  static forFeature(): DynamicModule {
    return {
      module: DrizzleNotificationStoreModule,
      global: true,
      providers: storeProviders,
      exports: [DrizzleNotificationStore, NOTIFICATION_STORE],
    };
  }
}
