import { NOTIFICATION_STORE } from '@dudousxd/nestjs-notifications-database';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { type DynamicModule, Module } from '@nestjs/common';
import { MikroOrmNotificationStore } from './mikro-orm-notification.store';
import { notificationEntity } from './notification.entity';
import { NotificationRepository } from './notification.repository';
import { MIKRO_ORM_NOTIFICATIONS_OPTIONS } from './schema-name';

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
  /**
   * `forFeature({ schema: 'notifications' })` keeps the table in that Postgres schema (MySQL:
   * database), created at boot; register `notificationEntity({ schema })` in the ORM config.
   */
  static forFeature(options: { schema?: string } = {}): DynamicModule {
    return {
      module: MikroOrmNotificationStoreModule,
      imports: [MikroOrmModule.forFeature([notificationEntity(options)])],
      providers: [
        ...(options.schema !== undefined
          ? [{ provide: MIKRO_ORM_NOTIFICATIONS_OPTIONS, useValue: { schema: options.schema } }]
          : []),
        MikroOrmNotificationStore,
        { provide: NOTIFICATION_STORE, useExisting: MikroOrmNotificationStore },
      ],
      exports: [MikroOrmNotificationStore, NOTIFICATION_STORE, NotificationRepository],
    };
  }
}
