import { type DynamicModule, Module } from '@nestjs/common';
import { DrizzlePendingDigestStore } from './drizzle-pending-digest.store';
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

/**
 * `@dudousxd/nestjs-notifications-preferences`'s PENDING_DIGEST_STORE token, inlined via the
 * global Symbol registry instead of imported: preferences is an OPTIONAL peer of this package,
 * and a value import would make `require`-ing this package crash at boot for every consumer that
 * doesn't install it. `Symbol.for` with the same key yields the identical token — a drift test
 * pins the key to the preferences export.
 */
const PENDING_DIGEST_STORE = Symbol.for('nestjs-notifications:pending-digest-store');

const storeProviders = [
  DrizzlePendingDigestStore,
  { provide: PENDING_DIGEST_STORE, useExisting: DrizzlePendingDigestStore },
];

/**
 * Provides the Drizzle-backed pending-digest store and binds it to the PENDING_DIGEST_STORE token
 * consumed by the DigestCollector from `@dudousxd/nestjs-notifications-preferences`.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     PreferencesModule.forCenter({ categories }),
 *     DrizzlePendingDigestStoreModule.forRoot({ db }),
 *     PreferencesModule.forDigest({ store: DrizzlePendingDigestStore, dailyCron: '0 9 * * *' }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
// Global so a SIBLING `DatabaseChannelModule.forFeature()` (a separate module that imports
// nothing) can resolve the store token — the documented pairing.
@Module({})
export class DrizzlePendingDigestStoreModule {
  static forRoot(options: DrizzleStoreModuleOptions): DynamicModule {
    return {
      module: DrizzlePendingDigestStoreModule,
      global: true,
      providers: [...staticProviders(options), ...storeProviders],
      exports: [DrizzlePendingDigestStore, PENDING_DIGEST_STORE, ...TOKENS],
    };
  }

  static forRootAsync(options: DrizzleStoreModuleAsyncOptions): DynamicModule {
    const { imports, providers } = asyncProviders(options);
    return {
      module: DrizzlePendingDigestStoreModule,
      global: true,
      imports,
      providers: [...providers, ...storeProviders],
      exports: [DrizzlePendingDigestStore, PENDING_DIGEST_STORE, ...TOKENS],
    };
  }

  /** Assumes the Drizzle db token is provided elsewhere. */
  static forFeature(): DynamicModule {
    return {
      module: DrizzlePendingDigestStoreModule,
      global: true,
      providers: storeProviders,
      exports: [DrizzlePendingDigestStore, PENDING_DIGEST_STORE],
    };
  }
}
