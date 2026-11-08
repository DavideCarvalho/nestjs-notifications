import { Inject, Injectable, Optional } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';
import type { DispatchDriver, NotificationJob } from '../interfaces';
import { NotificationSerializer } from '../serializer';
import { NOTIFICATIONS_OUTBOX_OPTIONS, NOTIFICATIONS_OUTBOX_TOPIC } from './constants';
import type { OutboxDispatcherOptions } from './options';

/**
 * A transactional {@link DispatchDriver} over `@nestjs/outbox`: each job is written to the outbox
 * (topic {@link NOTIFICATIONS_OUTBOX_TOPIC}) through the caller's transaction, and the relay hands
 * it to {@link OutboxNotificationHandler} after the commit. The outbox owns retries, ordering,
 * dead letters and the inbox; this class only serializes the job.
 *
 * The transaction comes from `notifications.inTransaction(tx)`. A job without one (a plain
 * `sendAsync()`, a quiet-hours re-queue from the handler) opens one with
 * {@link OutboxDispatcherOptions.transaction}, or fails when that option isn't set.
 */
@Injectable()
export class OutboxDispatcher implements DispatchDriver {
  readonly transactional = true;

  constructor(
    private readonly outbox: Outbox,
    private readonly serializer: NotificationSerializer,
    @Optional()
    @Inject(NOTIFICATIONS_OUTBOX_OPTIONS)
    private readonly options: OutboxDispatcherOptions = {},
  ) {}

  async dispatch(job: NotificationJob): Promise<void> {
    await this.dispatchMany([job]);
  }

  async dispatchMany(jobs: NotificationJob[]): Promise<void> {
    // One send shares one transaction; group anyway, so mixed callers stay correct.
    const groups = new Map<unknown, NotificationJob[]>();
    const detached: NotificationJob[] = [];
    for (const job of jobs) {
      if (job.transaction === undefined) {
        detached.push(job);
        continue;
      }
      const list = groups.get(job.transaction) ?? [];
      list.push(job);
      groups.set(job.transaction, list);
    }
    for (const [tx, list] of groups) await this.add(tx, list);
    if (detached.length > 0) {
      const open = this.options.transaction;
      if (!open) {
        throw new Error(
          'OutboxDispatcher: this notification job has no transaction. Send it with ' +
            'notifications.inTransaction(tx), or pass outboxDispatcher({ transaction: (work) => db.transaction(work) }) ' +
            'so jobs sent outside one (sendAsync, quiet-hours re-queues) open their own.',
        );
      }
      await open((tx) => this.add(tx, detached));
      // The transaction has committed here: skip the relay's poll interval.
      this.outbox.notify();
    }
  }

  private async add(tx: unknown, jobs: NotificationJob[]): Promise<void> {
    await this.outbox.add(
      tx,
      jobs.map((job) => ({
        topic: NOTIFICATIONS_OUTBOX_TOPIC,
        payload: this.serializer.serialize(job),
        ...(this.options.key ? { key: this.options.key(job) } : {}),
        ...(job.delay && job.delay > 0 ? { delay: job.delay } : {}),
      })),
    );
  }
}
