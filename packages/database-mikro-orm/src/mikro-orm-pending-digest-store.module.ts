import { PENDING_DIGEST_STORE } from '@dudousxd/nestjs-notifications-preferences';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { type DynamicModule, Module } from '@nestjs/common';
import { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';

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
  static forFeature(): DynamicModule {
    return {
      module: MikroOrmPendingDigestStoreModule,
      imports: [MikroOrmModule.forFeature([PendingDigestEntity, DigestWindowEntity])],
      providers: [
        MikroOrmPendingDigestStore,
        { provide: PENDING_DIGEST_STORE, useExisting: MikroOrmPendingDigestStore },
      ],
      exports: [MikroOrmPendingDigestStore, PENDING_DIGEST_STORE],
    };
  }
}
