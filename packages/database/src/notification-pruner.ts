import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { NotificationStore } from './interfaces';
import { NOTIFICATION_STORE, PRUNE_OPTIONS } from './tokens';

/** Configures the scheduled deletion of old notifications. */
export interface PruneOptions {
  /** Delete notifications older than this age, in milliseconds (e.g. `90 * 24 * 60 * 60 * 1000`). */
  olderThan: number;
  /** How often to run the prune sweep, in milliseconds. Default `3600000` (1 hour). */
  every?: number;
  /** Only delete notifications that have been read. Default `false` (prune by age regardless). */
  onlyRead?: boolean;
  /** Run a sweep immediately on bootstrap, before the first interval. Default `false`. */
  runOnStartup?: boolean;
}

/**
 * Periodically deletes notifications older than {@link PruneOptions.olderThan} by calling the
 * store's optional `prune()`. Runs on a plain `setInterval` (no extra scheduler dependency); the
 * timer is `unref`'d so it never keeps the process alive on its own. Disabled unless `prune` is
 * passed to `DatabaseChannelModule.forRoot`.
 */
@Injectable()
export class NotificationPruner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Notifications');
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
    @Inject(PRUNE_OPTIONS)
    private readonly options: PruneOptions | null,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.options) return;
    if (typeof this.store.prune !== 'function') {
      this.logger.warn(
        'Notification prune is configured but the store does not implement prune(); skipping.',
      );
      return;
    }
    if (this.options.runOnStartup) void this.sweep();
    const every = this.options.every ?? 3_600_000;
    this.timer = setInterval(() => void this.sweep(), every);
    // Don't keep the event loop alive solely for pruning.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Run one prune sweep now. Returns how many notifications were deleted. */
  async sweep(): Promise<number> {
    if (!this.options || typeof this.store.prune !== 'function') return 0;
    const before = new Date(Date.now() - this.options.olderThan);
    try {
      const deleted = await this.store.prune({ before, onlyRead: this.options.onlyRead });
      if (deleted > 0) {
        this.logger.log(`Pruned ${deleted} notification(s) older than ${before.toISOString()}.`);
      }
      return deleted;
    } catch (error) {
      this.logger.error(
        `Notification prune failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}
