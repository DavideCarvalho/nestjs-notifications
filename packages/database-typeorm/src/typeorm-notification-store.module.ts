import { NOTIFICATION_STORE } from '@dudousxd/nestjs-notifications-database';
import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './notification.entity';
import { TypeOrmNotificationStore } from './typeorm-notification.store';

/**
 * Provides the TypeORM-backed notification store and binds it to the
 * {@link NOTIFICATION_STORE} token consumed by the database channel.
 *
 * Pair this with `DatabaseChannelModule.forFeature()` from
 * `@dudousxd/nestjs-notifications-database`: this module provides the store token, while
 * `forFeature()` registers the channel that consumes it.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     TypeOrmNotificationStoreModule.forFeature(),
 *     DatabaseChannelModule.forFeature(),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class TypeOrmNotificationStoreModule {
  static forFeature(): DynamicModule {
    return {
      module: TypeOrmNotificationStoreModule,
      imports: [TypeOrmModule.forFeature([NotificationEntity])],
      providers: [
        TypeOrmNotificationStore,
        { provide: NOTIFICATION_STORE, useExisting: TypeOrmNotificationStore },
      ],
      exports: [TypeOrmNotificationStore, NOTIFICATION_STORE],
    };
  }
}
