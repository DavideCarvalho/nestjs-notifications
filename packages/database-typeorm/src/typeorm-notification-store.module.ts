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
// Global so a SIBLING `DatabaseChannelModule.forFeature()` (a separate module that imports
// nothing) can resolve the NOTIFICATION_STORE token — the documented pairing. Mirrors the Drizzle
// adapter.
@Module({})
export class TypeOrmNotificationStoreModule {
  static forFeature(): DynamicModule {
    const repositories = TypeOrmModule.forFeature([NotificationEntity]);
    return {
      module: TypeOrmNotificationStoreModule,
      global: true,
      imports: [repositories],
      providers: [
        TypeOrmNotificationStore,
        { provide: NOTIFICATION_STORE, useExisting: TypeOrmNotificationStore },
      ],
      // Re-export the repository so `DatabaseChannelModule.forRoot({ store: TypeOrmNotificationStore })`
      // can construct the store too.
      exports: [TypeOrmNotificationStore, NOTIFICATION_STORE, repositories],
    };
  }
}
