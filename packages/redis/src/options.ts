/** Configuration for the Redis dispatcher and its worker. */
export interface RedisDispatcherOptions {
  /** ioredis connection: a URL string or a host/port (+optional password) object. */
  connection: string | { host: string; port: number; password?: string };
  /** Redis list key used as the ready-job queue. Defaults to `nestjs-notifications:jobs`. */
  key?: string;
  /**
   * Redis sorted-set key holding delayed jobs (score = absolute fire time, ms). A poller moves
   * due jobs onto {@link key}. Durable across restarts — unlike the old in-process `setTimeout`.
   * Defaults to `nestjs-notifications:scheduled`.
   */
  scheduledKey?: string;
  /**
   * Redis list key that terminally-failed jobs are pushed to (the dead-letter queue). A job lands
   * here after it has failed {@link maxAttempts} times. Defaults to `nestjs-notifications:dead`.
   */
  deadLetterKey?: string;
  /**
   * How many times the worker delivers a job before moving it to the dead-letter list. `1` means
   * no retry (the old behavior: a failed job was simply dropped — now it is dead-lettered).
   * Defaults to `3`.
   */
  maxAttempts?: number;
  /**
   * How often (ms) the worker polls the scheduled sorted-set for due jobs. Defaults to `1000`.
   */
  pollIntervalMs?: number;
}

/** Default Redis list key when {@link RedisDispatcherOptions.key} is omitted. */
export const DEFAULT_KEY = 'nestjs-notifications:jobs';

/** Default sorted-set key for delayed jobs. */
export const DEFAULT_SCHEDULED_KEY = 'nestjs-notifications:scheduled';

/** Default dead-letter list key. */
export const DEFAULT_DEAD_LETTER_KEY = 'nestjs-notifications:dead';

/** Default max delivery attempts before dead-lettering. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/** Default scheduled-set poll interval, in milliseconds. */
export const DEFAULT_POLL_INTERVAL_MS = 1000;
