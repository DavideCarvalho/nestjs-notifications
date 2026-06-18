import { NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { DispatchDriver, NotificationJob } from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DEFAULT_KEY, DEFAULT_SCHEDULED_KEY, type RedisDispatcherOptions } from './options';
import { REDIS_CLIENT, REDIS_DISPATCHER_OPTIONS } from './tokens';

/**
 * Pushes serialized notification jobs onto a Redis list. A dedicated worker process running
 * {@link RedisNotificationWorker} pops and delivers them — no BullMQ involved.
 *
 * Delayed jobs are stored durably in a Redis sorted-set (score = absolute fire time) instead of
 * an in-process `setTimeout`, so a scheduled notification survives an API/worker restart. The
 * worker's poller moves due jobs onto the ready list.
 */
@Injectable()
export class RedisNotificationDispatcher implements DispatchDriver {
  private readonly key: string;
  private readonly scheduledKey: string;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly client: Redis,
    private readonly serializer: NotificationSerializer,
    @Inject(REDIS_DISPATCHER_OPTIONS)
    private readonly options: RedisDispatcherOptions,
  ) {
    this.key = options.key ?? DEFAULT_KEY;
    this.scheduledKey = options.scheduledKey ?? DEFAULT_SCHEDULED_KEY;
  }

  async dispatch(job: NotificationJob): Promise<void> {
    const payload = JSON.stringify(this.serializer.serialize(job));
    if (job.delay && job.delay > 0) {
      // Durable delay: store in the sorted-set scored by the absolute fire time. The worker's
      // poller promotes it to the ready list once due. Survives a process restart.
      const fireAt = Date.now() + job.delay;
      await this.client.zadd(this.scheduledKey, fireAt, payload);
      return;
    }
    await this.client.lpush(this.key, payload);
  }
}
