import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { RedisDispatcherOptions } from './options';
import { RedisNotificationDispatcher } from './redis.dispatcher';
import { RedisNotificationWorker } from './redis.worker';
import { REDIS_CLIENT, REDIS_DISPATCHER_OPTIONS } from './tokens';

/**
 * Provides the Redis dispatcher, its worker, and a shared ioredis client.
 *
 * On the API process you only need the dispatcher; on the worker process the
 * {@link RedisNotificationWorker} drains the queue. The module registers both, so pair it
 * with `NotificationsModule`:
 *
 * ```ts
 * NotificationsModule.forRoot({
 *   dispatcher: RedisNotificationDispatcher,
 *   imports: [RedisDispatcherModule.forRoot({ connection: 'redis://localhost:6379' })],
 *   notifications: [...],
 *   resolveNotifiable,
 * });
 * ```
 */
@Module({})
export class RedisDispatcherModule {
  static forRoot(options: RedisDispatcherOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: REDIS_DISPATCHER_OPTIONS, useValue: options },
      {
        provide: REDIS_CLIENT,
        useFactory: () =>
          typeof options.connection === 'string'
            ? new Redis(options.connection)
            : new Redis(options.connection),
      },
      RedisNotificationDispatcher,
      RedisNotificationWorker,
    ];

    return {
      module: RedisDispatcherModule,
      global: true,
      providers,
      exports: [RedisNotificationDispatcher],
    };
  }
}
