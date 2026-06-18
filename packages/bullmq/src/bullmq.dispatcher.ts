import { NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { DispatchDriver, NotificationJob } from '@dudousxd/nestjs-notifications-core';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './constants';
import { BULLMQ_DISPATCHER_OPTIONS, type BullmqDispatcherOptions } from './options';

/** Job name used when enqueuing a notification onto the BullMQ queue. */
const SEND_JOB = 'send';

/** Original hardcoded defaults — kept for backward compatibility when no options are provided. */
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF = { type: 'exponential', delay: 1000 } as const;

/**
 * Enqueues notifications onto a BullMQ queue for out-of-process delivery, reusing the
 * application's existing `@nestjs/bullmq` setup.
 *
 * Retry/backoff and job-retention are configurable via {@link BullmqDispatcherOptions}; when no
 * options are supplied the original defaults (`attempts: 3`, exponential `1s` backoff) apply.
 *
 * The job is fully serialized before enqueuing so it survives the trip through Redis; the
 * {@link BullmqNotificationProcessor} rehydrates it on the worker side.
 */
@Injectable()
export class BullmqNotificationDispatcher implements DispatchDriver {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue,
    private readonly serializer: NotificationSerializer,
    @Optional()
    @Inject(BULLMQ_DISPATCHER_OPTIONS)
    private readonly options?: BullmqDispatcherOptions,
  ) {}

  async dispatch(job: NotificationJob): Promise<void> {
    const payload = this.serializer.serialize(job);
    const jobOptions: JobsOptions = {
      attempts: this.options?.attempts ?? DEFAULT_ATTEMPTS,
      backoff: this.options?.backoff ?? DEFAULT_BACKOFF,
      ...(this.options?.removeOnComplete !== undefined
        ? { removeOnComplete: this.options.removeOnComplete }
        : {}),
      ...(this.options?.removeOnFail !== undefined
        ? { removeOnFail: this.options.removeOnFail }
        : {}),
      // Scheduled delivery: BullMQ holds the job until the delay elapses.
      ...(job.delay && job.delay > 0 ? { delay: job.delay } : {}),
    };
    await this.queue.add(SEND_JOB, payload, jobOptions);
  }
}
