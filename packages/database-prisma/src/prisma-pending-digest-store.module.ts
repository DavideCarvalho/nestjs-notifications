import { type DynamicModule, Module } from '@nestjs/common';
import {
  PRISMA_PENDING_DIGEST_CLIENT,
  type PrismaPendingDigestClientLike,
} from './prisma-pending-digest-client';
import { PrismaPendingDigestStore } from './prisma-pending-digest.store';

/**
 * `@dudousxd/nestjs-notifications-preferences`'s PENDING_DIGEST_STORE token, inlined via the
 * global Symbol registry instead of imported: preferences is an OPTIONAL peer of this package,
 * and a value import would make `require`-ing this package crash at boot for every consumer
 * that doesn't install it (type imports above are erased and safe). `Symbol.for` with the same
 * key yields the identical token, so DI binding still matches — a drift test pins the key to
 * the preferences export.
 */
const PENDING_DIGEST_STORE = Symbol.for('nestjs-notifications:pending-digest-store');

/** Options for {@link PrismaPendingDigestStoreModule.forRoot}. */
export interface PrismaPendingDigestStoreOptions {
  /**
   * The Prisma client instance. A real `PrismaClient` (with the `PendingDigest` + `DigestWindow`
   * models declared) structurally satisfies {@link PrismaPendingDigestClientLike}, so pass it
   * directly.
   */
  client: PrismaPendingDigestClientLike;
}

/**
 * Provides the Prisma-backed pending-digest store and binds it to the {@link PENDING_DIGEST_STORE}
 * token consumed by the {@link DigestCollector} from `@dudousxd/nestjs-notifications-preferences`.
 *
 * Unlike the TypeORM/MikroORM adapters, Prisma's client is app-owned, so it must be supplied. Use
 * {@link PrismaPendingDigestStoreModule.forRoot} to register an existing client, or
 * {@link PrismaPendingDigestStoreModule.forFeature} if you already provide the
 * {@link PRISMA_PENDING_DIGEST_CLIENT} token elsewhere (e.g. a shared `PrismaModule`).
 *
 * Pair with `PreferencesModule.forCenter(...)` + `PreferencesModule.forDigest()`: this module
 * provides the persistent store; `forDigest` provides the collector/sink/scheduler.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     PreferencesModule.forCenter({ categories }),
 *     PrismaPendingDigestStoreModule.forRoot({ client: prisma }),
 *     PreferencesModule.forDigest({ store: PrismaPendingDigestStore, dailyCron: '0 9 * * *' }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class PrismaPendingDigestStoreModule {
  /**
   * Registers the store with an app-provided Prisma client, binding it to the
   * {@link PRISMA_PENDING_DIGEST_CLIENT} token.
   */
  static forRoot(options: PrismaPendingDigestStoreOptions): DynamicModule {
    return {
      module: PrismaPendingDigestStoreModule,
      providers: [
        { provide: PRISMA_PENDING_DIGEST_CLIENT, useValue: options.client },
        PrismaPendingDigestStore,
        { provide: PENDING_DIGEST_STORE, useExisting: PrismaPendingDigestStore },
      ],
      exports: [PrismaPendingDigestStore, PENDING_DIGEST_STORE],
    };
  }

  /**
   * Registers the store assuming the {@link PRISMA_PENDING_DIGEST_CLIENT} token is already provided
   * by an imported/global module. Optionally pass a `client` to bind the token inline (equivalent to
   * {@link PrismaPendingDigestStoreModule.forRoot}).
   */
  static forFeature(client?: PrismaPendingDigestClientLike): DynamicModule {
    const providers = client ? [{ provide: PRISMA_PENDING_DIGEST_CLIENT, useValue: client }] : [];
    return {
      module: PrismaPendingDigestStoreModule,
      providers: [
        ...providers,
        PrismaPendingDigestStore,
        { provide: PENDING_DIGEST_STORE, useExisting: PrismaPendingDigestStore },
      ],
      exports: [PrismaPendingDigestStore, PENDING_DIGEST_STORE],
    };
  }
}
