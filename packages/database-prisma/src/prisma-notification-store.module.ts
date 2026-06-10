import { NOTIFICATION_STORE } from '@dudousxd/nestjs-notifications-database';
import { type DynamicModule, Module } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaNotificationClientLike } from './prisma-client';
import { PrismaNotificationStore } from './prisma-notification.store';

/** Options for {@link PrismaNotificationStoreModule.forRoot}. */
export interface PrismaNotificationStoreOptions {
  /**
   * The Prisma client instance. A real `PrismaClient` structurally satisfies
   * {@link PrismaNotificationClientLike}, so pass it directly.
   */
  client: PrismaNotificationClientLike;
}

/**
 * Provides the Prisma-backed notification store and binds it to the
 * {@link NOTIFICATION_STORE} token consumed by the database channel.
 *
 * Unlike the TypeORM/MikroORM adapters, Prisma's client is app-owned, so it must
 * be supplied. Use {@link PrismaNotificationStoreModule.forRoot} to register an
 * existing client, or use {@link PrismaNotificationStoreModule.forFeature} if you
 * already provide the {@link PRISMA_CLIENT} token elsewhere (e.g. a shared
 * `PrismaModule`).
 *
 * Pair this with `DatabaseChannelModule.forFeature()` from
 * `@dudousxd/nestjs-notifications-database`: this module provides the store token, while
 * `forFeature()` registers the channel that consumes it.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     PrismaNotificationStoreModule.forRoot({ client: prisma }),
 *     DatabaseChannelModule.forFeature(),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class PrismaNotificationStoreModule {
  /**
   * Registers the store with an app-provided Prisma client, binding it to the
   * {@link PRISMA_CLIENT} token.
   */
  static forRoot(options: PrismaNotificationStoreOptions): DynamicModule {
    return {
      module: PrismaNotificationStoreModule,
      providers: [
        { provide: PRISMA_CLIENT, useValue: options.client },
        PrismaNotificationStore,
        { provide: NOTIFICATION_STORE, useExisting: PrismaNotificationStore },
      ],
      exports: [PrismaNotificationStore, NOTIFICATION_STORE],
    };
  }

  /**
   * Registers the store assuming the {@link PRISMA_CLIENT} token is already
   * provided by an imported/global module. Optionally pass a `client` to bind the
   * token inline (equivalent to {@link PrismaNotificationStoreModule.forRoot}).
   */
  static forFeature(client?: PrismaNotificationClientLike): DynamicModule {
    const providers = client ? [{ provide: PRISMA_CLIENT, useValue: client }] : [];
    return {
      module: PrismaNotificationStoreModule,
      providers: [
        ...providers,
        PrismaNotificationStore,
        { provide: NOTIFICATION_STORE, useExisting: PrismaNotificationStore },
      ],
      exports: [PrismaNotificationStore, NOTIFICATION_STORE],
    };
  }
}
