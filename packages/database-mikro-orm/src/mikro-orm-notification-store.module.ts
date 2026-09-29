import { NOTIFICATION_STORE } from '@dudousxd/nestjs-notifications-database';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { type DynamicModule, Module } from '@nestjs/common';
import { MikroOrmNotificationStore } from './mikro-orm-notification.store';
import { NotificationEntity } from './notification.entity';

/**
 * Provides the MikroORM-backed notification store and binds it to the
 * {@link NOTIFICATION_STORE} token consumed by the database channel.
 *
 * Pair this with `DatabaseChannelModule.forFeature()` from
 * `@dudousxd/nestjs-notifications-database`: this module provides the store token, while
 * `forFeature()` registers the channel that consumes it.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     MikroOrmNotificationStoreModule.forFeature(),
 *     DatabaseChannelModule.forFeature(),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
// Global so a SIBLING `DatabaseChannelModule.forFeature()` (a separate module that imports
// nothing) can resolve the NOTIFICATION_STORE token — the documented pairing. Mirrors the Drizzle
// adapter.
@Module({})
export class MikroOrmNotificationStoreModule {
  static forFeature(): DynamicModule {
    // Registers `NotificationRepository` (the entity's custom repository) as a provider.
    const repositories = MikroOrmModule.forFeature([NotificationEntity]);
    return {
      module: MikroOrmNotificationStoreModule,
      global: true,
      imports: [repositories],
      providers: [
        MikroOrmNotificationStore,
        { provide: NOTIFICATION_STORE, useExisting: MikroOrmNotificationStore },
      ],
      // `NotificationRepository` is provided by the imported forFeature module, so re-export that
      // module (Nest refuses to export a provider token the module doesn't own itself).
      exports: [MikroOrmNotificationStore, NOTIFICATION_STORE, repositories],
    };
  }
}
