import { ChannelRunner, NotificationSerializer } from '@nestjs-notifications/core';
import type { NotificationJob } from '@nestjs-notifications/core';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './constants';

/**
 * Consumes notification jobs from the BullMQ queue and delivers them. Register it as a
 * provider on the worker process (the {@link bullmqDispatcher} helper does this for you).
 */
@Processor(NOTIFICATIONS_QUEUE)
export class BullmqNotificationProcessor extends WorkerHost {
  constructor(
    private readonly serializer: NotificationSerializer,
    private readonly channelRunner: ChannelRunner,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const data = job.data;
    const { notifiable, notification } = await this.serializer.hydrateJob(data);
    await this.channelRunner.run(notifiable, notification, data.channels);
  }
}
