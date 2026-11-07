import type { NotificationJob } from '../interfaces';

/** Options for {@link outboxDispatcher}. */
export interface OutboxDispatcherOptions {
  /**
   * Opens a transaction for a job that wasn't sent with `inTransaction(tx)` (a plain
   * `sendAsync()`, a queued notification, a quiet-hours re-queue), e.g.
   * `(work) => db.transaction(work)`. Without it such a job fails to dispatch.
   */
  transaction?: <T>(work: (tx: unknown) => Promise<T>) => Promise<T>;
  /**
   * The outbox ordering key of a job: jobs sharing a key are delivered one at a time, in order.
   * Default: none (no ordering, maximum parallelism).
   */
  key?: (job: NotificationJob) => string | null;
}
