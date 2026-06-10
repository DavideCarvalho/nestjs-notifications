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
@Module({})
export class MikroOrmNotificationStoreModule {
  static forFeature(): DynamicModule {
    return {
      module: MikroOrmNotificationStoreModule,
      imports: [MikroOrmModule.forFeature([NotificationEntity])],
      providers: [
        MikroOrmNotificationStore,
        { provide: NOTIFICATION_STORE, useExisting: MikroOrmNotificationStore },
      ],
      exports: [MikroOrmNotificationStore, NOTIFICATION_STORE],
    };
  }
}
