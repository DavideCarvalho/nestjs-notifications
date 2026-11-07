import { Injectable } from '@nestjs/common';
import { OnOutboxMessage, type OutboxHandlerContext } from '@nestjs/outbox';
import { ChannelRunner } from '../channel-runner';
import { NotificationSerializer, type SerializedJob } from '../serializer';
import { NOTIFICATIONS_OUTBOX_CONSUMER, NOTIFICATIONS_OUTBOX_TOPIC } from './constants';

/**
 * Delivers the notification jobs the outbox relays: rehydrates the job and runs its channels, the
 * outbox counterpart of the BullMQ processor. The outbox message id becomes the delivery's
 * `idempotencyKey` (the mail channel passes it to `@nestjs/mail`, so a redelivery keeps its
 * `Message-ID`). The inbox (`consumer: 'aviary.notifications'`) skips a message already handled.
 *
 * Under the default `continueOnError` policy a failed channel is reported (events, delivery
 * tracking), not thrown, so the outbox doesn't retry it; with `failFast` the first failure is
 * thrown and the outbox retries the whole job.
 */
@Injectable()
export class OutboxNotificationHandler {
  constructor(
    private readonly serializer: NotificationSerializer,
    private readonly runner: ChannelRunner,
  ) {}

  @OnOutboxMessage(NOTIFICATIONS_OUTBOX_TOPIC, { consumer: NOTIFICATIONS_OUTBOX_CONSUMER })
  async handle(job: SerializedJob, context: OutboxHandlerContext): Promise<void> {
    const { notifiable, notification } = await this.serializer.hydrateJob(job);
    await this.runner.run(notifiable, notification, job.channels, {
      tenant: job.tenant,
      captured: job.captured,
      deferredChannels: job.deferredChannels,
      idempotencyKey: context.message.id,
    });
  }
}
