import { NOTIFICATION_STORE } from '@dudousxd/nestjs-notifications-database';
import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { type NotificationEntity, notificationEntity } from './notification.entity';
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
 *
 * `forFeature({ schema: 'notifications' })` keeps the table in that Postgres schema (MySQL:
 * database), created at boot; register `notificationEntity({ schema })` in the DataSource (or use
 * `autoLoadEntities`).
 */
@Module({})
export class TypeOrmNotificationStoreModule {
  static forFeature(options: { schema?: string } = {}): DynamicModule {
    const entity = notificationEntity(options);
    return {
      module: TypeOrmNotificationStoreModule,
      imports: [TypeOrmModule.forFeature([entity])],
      providers: [
        options.schema === undefined
          ? TypeOrmNotificationStore
          : {
              provide: TypeOrmNotificationStore,
              useFactory: (repo: Repository<NotificationEntity>) =>
                new TypeOrmNotificationStore(repo),
              inject: [getRepositoryToken(entity)],
            },
        { provide: NOTIFICATION_STORE, useExisting: TypeOrmNotificationStore },
      ],
      exports: [TypeOrmNotificationStore, NOTIFICATION_STORE],
    };
  }
}
