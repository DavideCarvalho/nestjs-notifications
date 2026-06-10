import { NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { DispatchDriver, NotificationJob } from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DEFAULT_KEY, type RedisDispatcherOptions } from './options';
import { REDIS_CLIENT, REDIS_DISPATCHER_OPTIONS } from './tokens';

/**
 * Pushes serialized notification jobs onto a Redis list. A dedicated worker process running
 * {@link RedisNotificationWorker} pops and delivers them — no BullMQ involved.
 */
@Injectable()
export class RedisNotificationDispatcher implements DispatchDriver {
  private readonly key: string;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly client: Redis,
    private readonly serializer: NotificationSerializer,
    @Inject(REDIS_DISPATCHER_OPTIONS)
    private readonly options: RedisDispatcherOptions,
  ) {
    this.key = options.key ?? DEFAULT_KEY;
  }

  async dispatch(job: NotificationJob): Promise<void> {
    await this.client.lpush(this.key, JSON.stringify(this.serializer.serialize(job)));
  }
}
