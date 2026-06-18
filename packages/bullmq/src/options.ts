import type { Job } from 'bullmq';

/** DI token for the optional {@link BullmqDispatcherOptions}. */
export const BULLMQ_DISPATCHER_OPTIONS = Symbol('BULLMQ_DISPATCHER_OPTIONS');

/** BullMQ backoff strategy applied to retried notification jobs. */
export interface BullmqBackoffOptions {
  /** `exponential` (default) or `fixed`, or a custom strategy name registered on the worker. */
  type: string;
  /** Base delay between retries, in milliseconds. */
  delay?: number;
}

/**
 * How long a finished/failed job is kept before BullMQ removes it. `true` removes immediately,
 * `false` keeps forever, a number keeps that many jobs, and the object form keeps by age (seconds)
 * and/or a max count. Mirrors BullMQ's own `KeepJobs` so it passes straight through to `queue.add`.
 */
export type KeepJobs = boolean | number | { age: number; count?: number };

/**
 * Tuning for how the BullMQ dispatcher enqueues notification jobs and how it reacts to terminal
 * failures. Every field is optional; omitting all of it reproduces the original hardcoded behavior
 * (`attempts: 3`, exponential `1s` backoff, no removal, no failed-job handling).
 */
export interface BullmqDispatcherOptions {
  /** Max delivery attempts before a job is considered terminally failed. Default `3`. */
  attempts?: number;
  /** Retry backoff strategy. Default `{ type: 'exponential', delay: 1000 }`. */
  backoff?: BullmqBackoffOptions;
  /** Whether/how to remove jobs once they complete. Default: keep. */
  removeOnComplete?: KeepJobs;
  /** Whether/how to remove jobs once they fail terminally. Default: keep. */
  removeOnFail?: KeepJobs;
  /**
   * Invoked once a job has exhausted all `attempts` and failed terminally — the dead-letter hook.
   * Route the job to a DLQ, alert, or persist it here. `reason` is the last error message reported
   * by BullMQ. Errors thrown by the callback are swallowed (logged) so they can't crash the worker.
   */
  onFailed?: (job: Job | undefined, reason: string) => void | Promise<void>;
}
