import { ChannelRunner, NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { NotificationJob } from '@dudousxd/nestjs-notifications-core';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  DEFAULT_DEAD_LETTER_KEY,
  DEFAULT_KEY,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_SCHEDULED_KEY,
  type RedisDispatcherOptions,
} from './options';
import { REDIS_DISPATCHER_OPTIONS } from './tokens';

/** A consumed payload, with the worker's own retry bookkeeping (not part of the wire job). */
interface WorkerEnvelope extends NotificationJob {
  /** Number of delivery attempts already made (0 on first consume). */
  attempts?: number;
}

/**
 * Long-running worker that drains the Redis job list and delivers notifications. Runs on a
 * dedicated worker process. Uses its own blocking connection (separate from the dispatcher's
 * client) so a blocking `BRPOP` never starves other commands.
 *
 * Two loops run concurrently:
 * - **consume**: `BRPOP` the ready list and deliver. A delivery failure is retried up to
 *   `maxAttempts`, then the job is pushed to the dead-letter list (previously such jobs were
 *   silently dropped).
 * - **poll**: every `pollIntervalMs`, promote due jobs from the scheduled sorted-set onto the
 *   ready list (`ZRANGEBYSCORE 0 now` → `LPUSH` + `ZREM`), making delays durable across restarts.
 */
@Injectable()
export class RedisNotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('RedisNotificationWorker');
  private readonly key: string;
  private readonly scheduledKey: string;
  private readonly deadLetterKey: string;
  private readonly maxAttempts: number;
  private readonly pollIntervalMs: number;
  private connection?: Redis;
  private pollConnection?: Redis;
  private stopped = false;
  private loop?: Promise<void>;
  private pollLoop?: Promise<void>;
  private pollTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly serializer: NotificationSerializer,
    private readonly channelRunner: ChannelRunner,
    @Inject(REDIS_DISPATCHER_OPTIONS)
    private readonly options: RedisDispatcherOptions,
  ) {
    this.key = options.key ?? DEFAULT_KEY;
    this.scheduledKey = options.scheduledKey ?? DEFAULT_SCHEDULED_KEY;
    this.deadLetterKey = options.deadLetterKey ?? DEFAULT_DEAD_LETTER_KEY;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  onModuleInit(): void {
    const connection =
      typeof this.options.connection === 'string'
        ? new Redis(this.options.connection)
        : new Redis(this.options.connection);
    this.connection = connection;
    // A second connection for the poller so it never contends with the blocking BRPOP.
    this.pollConnection =
      typeof this.options.connection === 'string'
        ? new Redis(this.options.connection)
        : new Redis(this.options.connection);
    this.loop = this.run(connection);
    this.pollLoop = this.runPoller(this.pollConnection);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.connection) {
      // `disconnect` unblocks any in-flight BRPOP immediately, then quit cleanly.
      this.connection.disconnect();
      try {
        await this.connection.quit();
      } catch {
        // already disconnected
      }
    }
    if (this.pollConnection) {
      this.pollConnection.disconnect();
      try {
        await this.pollConnection.quit();
      } catch {
        // already disconnected
      }
    }
    await this.loop?.catch(() => undefined);
    await this.pollLoop?.catch(() => undefined);
  }

  private async run(connection: Redis): Promise<void> {
    while (!this.stopped) {
      try {
        const popped = await connection.brpop(this.key, 0);
        if (!popped) continue;
        const [, raw] = popped;
        await this.handle(raw);
      } catch (error) {
        if (this.stopped) return;
        this.logger.error(`Redis worker loop error: ${describe(error)}`);
      }
    }
  }

  /** Periodically promote due scheduled jobs onto the ready list. */
  private async runPoller(connection: Redis): Promise<void> {
    while (!this.stopped) {
      try {
        await this.promoteDue(connection);
      } catch (error) {
        if (this.stopped) return;
        this.logger.error(`Redis scheduled-poll error: ${describe(error)}`);
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  /**
   * Move every scheduled job whose fire time has passed onto the ready list. Each due payload is
   * `LPUSH`ed then `ZREM`oved; ZREM removing 0 means another worker already claimed it, so we
   * skip the duplicate push by removing first via a small claim. To keep this dependency-free we
   * use the read-then-remove approach guarded by ZREM's return value.
   */
  async promoteDue(connection: Redis, now: number = Date.now()): Promise<void> {
    const due = await connection.zrangebyscore(this.scheduledKey, 0, now);
    for (const payload of due) {
      // Claim the job: only the worker whose ZREM removed it (returned 1) promotes it, so a
      // concurrent poller can't double-deliver.
      const removed = await connection.zrem(this.scheduledKey, payload);
      if (removed > 0) {
        await connection.lpush(this.key, payload);
      }
    }
  }

  private async handle(raw: string): Promise<void> {
    let parsed: WorkerEnvelope;
    try {
      parsed = JSON.parse(raw) as WorkerEnvelope;
    } catch (error) {
      this.logger.error(`Failed to parse notification job: ${describe(error)}`);
      await this.deadLetter(raw);
      return;
    }

    try {
      const { notifiable, notification } = await this.serializer.hydrateJob(parsed);
      // Re-establish the captured context (causer/tenant/trace) on the worker so the
      // out-of-process delivery still records WHO triggered it.
      await this.channelRunner.run(notifiable, notification, parsed.channels, {
        tenant: parsed.tenant,
        captured: parsed.captured,
      });
    } catch (error) {
      await this.onFailure(parsed, error);
    }
  }

  /** Retry a failed job up to `maxAttempts`, else dead-letter it. */
  private async onFailure(job: WorkerEnvelope, error: unknown): Promise<void> {
    const attempts = (job.attempts ?? 0) + 1;
    if (attempts < this.maxAttempts) {
      this.logger.warn(
        `Job failed (attempt ${attempts}/${this.maxAttempts}), re-queuing: ${describe(error)}`,
      );
      const retried: WorkerEnvelope = { ...job, attempts };
      await this.requeue(JSON.stringify(retried));
      return;
    }
    this.logger.error(
      `Job failed terminally after ${attempts} attempts, dead-lettering: ${describe(error)}`,
    );
    await this.deadLetter(JSON.stringify({ ...job, attempts }));
  }

  /** Re-enqueue a job onto the ready list for another delivery attempt. */
  private async requeue(payload: string): Promise<void> {
    if (this.connection) await this.connection.lpush(this.key, payload);
  }

  /** Push a terminally-failed (or unparseable) payload onto the dead-letter list. */
  private async deadLetter(payload: string): Promise<void> {
    if (this.connection) await this.connection.lpush(this.deadLetterKey, payload);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.pollTimer = setTimeout(resolve, ms);
    });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
