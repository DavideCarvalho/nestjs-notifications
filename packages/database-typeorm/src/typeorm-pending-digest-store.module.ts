import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  type DigestWindowEntity,
  type PendingDigestEntity,
  digestWindowEntity,
  pendingDigestEntity,
} from './pending-digest.entity';
import { TypeOrmPendingDigestStore } from './typeorm-pending-digest.store';

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
 *
 * `forFeature({ schema })` keeps both tables in that Postgres schema (MySQL: database); register
 * `pendingDigestEntity({ schema })` and `digestWindowEntity({ schema })` in the DataSource.
 */
@Module({})
export class TypeOrmPendingDigestStoreModule {
  static forFeature(options: { schema?: string } = {}): DynamicModule {
    const entries = pendingDigestEntity(options);
    const windows = digestWindowEntity(options);
    return {
      module: TypeOrmPendingDigestStoreModule,
      imports: [TypeOrmModule.forFeature([entries, windows])],
      providers: [
        options.schema === undefined
          ? TypeOrmPendingDigestStore
          : {
              provide: TypeOrmPendingDigestStore,
              useFactory: (e: Repository<PendingDigestEntity>, w: Repository<DigestWindowEntity>) =>
                new TypeOrmPendingDigestStore(e, w),
              inject: [getRepositoryToken(entries), getRepositoryToken(windows)],
            },
        { provide: PENDING_DIGEST_STORE, useExisting: TypeOrmPendingDigestStore },
      ],
      exports: [TypeOrmPendingDigestStore, PENDING_DIGEST_STORE],
    };
  }
}
