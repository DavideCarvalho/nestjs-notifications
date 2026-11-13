import { MikroOrmModule } from '@mikro-orm/nestjs';
import { type DynamicModule, Module } from '@nestjs/common';
import { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
import { digestWindowEntity, pendingDigestEntity } from './pending-digest.entity';
import { DigestWindowRepository, PendingDigestRepository } from './pending-digest.repository';
import { MIKRO_ORM_NOTIFICATIONS_OPTIONS } from './schema-name';

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
@Module({})
export class MikroOrmPendingDigestStoreModule {
  /**
   * `forFeature({ schema })` keeps both tables in that Postgres schema (MySQL: database); register
   * `pendingDigestEntity({ schema })` and `digestWindowEntity({ schema })` in the ORM config.
   */
  static forFeature(options: { schema?: string } = {}): DynamicModule {
    return {
      module: MikroOrmPendingDigestStoreModule,
      imports: [
        MikroOrmModule.forFeature([pendingDigestEntity(options), digestWindowEntity(options)]),
      ],
      providers: [
        ...(options.schema !== undefined
          ? [{ provide: MIKRO_ORM_NOTIFICATIONS_OPTIONS, useValue: { schema: options.schema } }]
          : []),
        MikroOrmPendingDigestStore,
        { provide: PENDING_DIGEST_STORE, useExisting: MikroOrmPendingDigestStore },
      ],
      exports: [
        MikroOrmPendingDigestStore,
        PENDING_DIGEST_STORE,
        PendingDigestRepository,
        DigestWindowRepository,
      ],
    };
  }
}
