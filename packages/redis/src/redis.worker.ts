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
import { DEFAULT_KEY, type RedisDispatcherOptions } from './options';
import { REDIS_DISPATCHER_OPTIONS } from './tokens';

/**
 * Long-running worker that drains the Redis job list and delivers notifications. Runs on a
 * dedicated worker process. Uses its own blocking connection (separate from the dispatcher's
 * client) so a blocking `BRPOP` never starves other commands.
 *
 * A single failing job is logged and skipped — the loop keeps running.
 */
@Injectable()
export class RedisNotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('RedisNotificationWorker');
  private readonly key: string;
  private connection?: Redis;
  private stopped = false;
  private loop?: Promise<void>;

  constructor(
    private readonly serializer: NotificationSerializer,
    private readonly channelRunner: ChannelRunner,
    @Inject(REDIS_DISPATCHER_OPTIONS)
    private readonly options: RedisDispatcherOptions,
  ) {
    this.key = options.key ?? DEFAULT_KEY;
  }

  onModuleInit(): void {
    const connection =
      typeof this.options.connection === 'string'
        ? new Redis(this.options.connection)
        : new Redis(this.options.connection);
    this.connection = connection;
    this.loop = this.run(connection);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.connection) {
      // `disconnect` unblocks any in-flight BRPOP immediately, then quit cleanly.
      this.connection.disconnect();
      try {
        await this.connection.quit();
      } catch {
        // already disconnected
      }
    }
    await this.loop?.catch(() => undefined);
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

  private async handle(raw: string): Promise<void> {
    try {
      const parsed = JSON.parse(raw) as NotificationJob;
      const { notifiable, notification } = await this.serializer.hydrateJob(parsed);
      await this.channelRunner.run(notifiable, notification, parsed.channels);
    } catch (error) {
      this.logger.error(`Failed to process notification job: ${describe(error)}`);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
