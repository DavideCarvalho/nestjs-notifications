import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OnOutboxMessage, type OutboxHandlerContext, OutboxStorage } from '@nestjs/outbox';
import { ChannelRunner } from '../channel-runner';
import type { ChannelCompletionLog } from '../interfaces';
import { NotificationSerializer, type SerializedJob } from '../serializer';
import { NOTIFICATIONS_OUTBOX_CONSUMER, NOTIFICATIONS_OUTBOX_TOPIC } from './constants';

/** The outbox inbox keeps consumer names and message ids in 255-character columns on MySQL. */
const MAX_INBOX_KEY_LENGTH = 255;

/**
 * Delivers the notification jobs the outbox relays: rehydrates the job and runs its channels, the
 * outbox counterpart of the BullMQ processor. The outbox message id becomes the delivery's
 * `idempotencyKey` (the mail channel passes it to `@nestjs/mail`, so a redelivery keeps its
 * `Message-ID`). The inbox (`consumer: 'aviary.notifications'`) skips a message already handled.
 *
 * Each channel that completes is also recorded in the outbox inbox, under the consumer
 * `aviary.notifications:<channel>` and the id `<message id>:<notifiable type>#<notifiable id>`,
 * and a redelivery of the message skips the channels recorded there. The records live in the
 * outbox's inbox store: durable with `PostgresOutboxStore`/`MySqlOutboxStore` (or any store that
 * implements the inbox), in-process only with the in-memory default. Prune them with
 * `OutboxInbox.prune()`, like the other inbox records.
 *
 * Under the default `continueOnError` policy a failed channel is reported (events, delivery
 * tracking), not thrown: the message counts as handled and the failed channel is not retried. With
 * `failFast` the first failure is thrown, the outbox retries the message, and the retry runs only
 * the channels not recorded yet: the failed one and those after it.
 */
@Injectable()
export class OutboxNotificationHandler {
  constructor(
    private readonly serializer: NotificationSerializer,
    private readonly runner: ChannelRunner,
    private readonly storage: OutboxStorage,
  ) {}

  @OnOutboxMessage(NOTIFICATIONS_OUTBOX_TOPIC, { consumer: NOTIFICATIONS_OUTBOX_CONSUMER })
  async handle(job: SerializedJob, context: OutboxHandlerContext): Promise<void> {
    const { notifiable, notification } = await this.serializer.hydrateJob(job);
    await this.runner.run(
      notifiable,
      notification,
      job.channels,
      {
        tenant: job.tenant,
        captured: job.captured,
        deferredChannels: job.deferredChannels,
        idempotencyKey: context.message.id,
      },
      this.completionLog(
        `${context.message.id}:${job.notifiable.type}#${String(job.notifiable.id)}`,
      ),
    );
  }

  /** Per-channel completion records for one delivery, in the outbox's inbox store. */
  private completionLog(deliveryId: string): ChannelCompletionLog {
    const inbox = this.storage.inbox;
    const messageId = inboxKey(deliveryId);
    const consumer = (channel: string) => inboxKey(`${NOTIFICATIONS_OUTBOX_CONSUMER}:${channel}`);
    return {
      isComplete: (channel) => inbox.hasInbox(consumer(channel), messageId),
      markComplete: async (channel) => {
        await inbox.recordInbox(undefined, consumer(channel), messageId, Date.now());
      },
    };
  }
}

/** The key itself when it fits the inbox columns, else a digest of it. */
function inboxKey(key: string): string {
  return key.length <= MAX_INBOX_KEY_LENGTH
    ? key
    : `sha256:${createHash('sha256').update(key).digest('hex')}`;
}
