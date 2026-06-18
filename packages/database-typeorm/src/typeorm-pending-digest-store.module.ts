import { PENDING_DIGEST_STORE } from '@dudousxd/nestjs-notifications-preferences';
import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
import { TypeOrmPendingDigestStore } from './typeorm-pending-digest.store';

/**
 * Provides the TypeORM-backed pending-digest store and binds it to the {@link PENDING_DIGEST_STORE}
 * token consumed by the {@link DigestCollector} from `@dudousxd/nestjs-notifications-preferences`.
 *
 * Pair with `PreferencesModule.forCenter(...)` + `PreferencesModule.forDigest()`: this module
 * provides the persistent store; `forDigest` provides the collector/sink/scheduler. Pass the store
 * to `forDigest` either by importing this module and letting `forDigest` pick up the bound token,
 * or by passing `store: TypeOrmPendingDigestStore` directly.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     PreferencesModule.forCenter({ categories }),
 *     TypeOrmPendingDigestStoreModule.forFeature(),
 *     PreferencesModule.forDigest({ store: TypeOrmPendingDigestStore, dailyCron: '0 9 * * *' }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class TypeOrmPendingDigestStoreModule {
  static forFeature(): DynamicModule {
    return {
      module: TypeOrmPendingDigestStoreModule,
      imports: [TypeOrmModule.forFeature([PendingDigestEntity, DigestWindowEntity])],
      providers: [
        TypeOrmPendingDigestStore,
        { provide: PENDING_DIGEST_STORE, useExisting: TypeOrmPendingDigestStore },
      ],
      exports: [TypeOrmPendingDigestStore, PENDING_DIGEST_STORE],
    };
  }
}
