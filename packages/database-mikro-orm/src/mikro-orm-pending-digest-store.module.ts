import { MikroOrmModule } from '@mikro-orm/nestjs';
import { type DynamicModule, Module } from '@nestjs/common';
import { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';

/**
 * `@dudousxd/nestjs-notifications-preferences`'s PENDING_DIGEST_STORE token, inlined via the
 * global Symbol registry instead of imported: preferences is an OPTIONAL peer of this package,
 * and a value import would make `require`-ing this package crash at boot for every consumer
 * that doesn't install it (type imports above are erased and safe). `Symbol.for` with the same
 * key yields the identical token, so DI binding still matches — a drift test pins the key to
 * the preferences export.
 */
const PENDING_DIGEST_STORE = Symbol.for('nestjs-notifications:pending-digest-store');

/**
 * Provides the MikroORM-backed pending-digest store and binds it to the {@link PENDING_DIGEST_STORE}
 * token consumed by the {@link DigestCollector} from `@dudousxd/nestjs-notifications-preferences`.
 *
 * Pair with `PreferencesModule.forCenter(...)` + `PreferencesModule.forDigest()`: this module
 * provides the persistent store; `forDigest` provides the collector/sink/scheduler. Pass the store
 * to `forDigest` either by importing this module and letting `forDigest` pick up the bound token,
 * or by passing `store: MikroOrmPendingDigestStore` directly.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     PreferencesModule.forCenter({ categories }),
 *     MikroOrmPendingDigestStoreModule.forFeature(),
 *     PreferencesModule.forDigest({ store: MikroOrmPendingDigestStore, dailyCron: '0 9 * * *' }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
// Global so SIBLING modules (e.g. `PreferencesModule.forDigest({ store: X })`, which constructs
// the store class in its own scope) can resolve the store, its tokens and its dependencies — the
// documented pairing. Mirrors the Drizzle adapter.
@Module({})
export class MikroOrmPendingDigestStoreModule {
  static forFeature(): DynamicModule {
    // Registers `PendingDigestRepository` + `DigestWindowRepository` as providers.
    const repositories = MikroOrmModule.forFeature([PendingDigestEntity, DigestWindowEntity]);
    return {
      module: MikroOrmPendingDigestStoreModule,
      global: true,
      imports: [repositories],
      providers: [
        MikroOrmPendingDigestStore,
        { provide: PENDING_DIGEST_STORE, useExisting: MikroOrmPendingDigestStore },
      ],
      // The repositories are provided by the imported forFeature module, so re-export that module
      // (Nest refuses to export a provider token the module doesn't own itself).
      exports: [MikroOrmPendingDigestStore, PENDING_DIGEST_STORE, repositories],
    };
  }
}
