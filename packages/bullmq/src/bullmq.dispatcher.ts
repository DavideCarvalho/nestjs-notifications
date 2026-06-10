import { NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { DispatchDriver, NotificationJob } from '@dudousxd/nestjs-notifications-core';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './constants';

/** Job name used when enqueuing a notification onto the BullMQ queue. */
const SEND_JOB = 'send';

/**
 * Enqueues notifications onto a BullMQ queue for out-of-process delivery, reusing the
 * application's existing `@nestjs/bullmq` setup.
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
  ) {}

  async dispatch(job: NotificationJob): Promise<void> {
    const payload = this.serializer.serialize(job);
    await this.queue.add(SEND_JOB, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      // Scheduled delivery: BullMQ holds the job until the delay elapses.
      ...(job.delay && job.delay > 0 ? { delay: job.delay } : {}),
    });
  }
}
