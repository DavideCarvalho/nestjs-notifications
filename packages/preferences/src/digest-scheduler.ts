import { Inject, Injectable, Logger, type OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DigestCollector, type DigestOptions } from './digest-collector';
import { DIGEST_OPTIONS } from './tokens';

/** Minimal shape of `@nestjs/schedule`'s SchedulerRegistry that we use, soft-typed. */
interface SchedulerRegistryLike {
  addCronJob(name: string, job: unknown): void;
}

/** Minimal shape of the `cron` package's CronJob constructor, soft-typed. */
type CronJobCtor = new (
  cronTime: string,
  onTick: () => void,
  onComplete: null,
  start: boolean,
) => unknown;

/**
 * OPTIONAL cron wiring for {@link DigestCollector.flushDigests}. Entirely opt-in and soft: it does
 * NOT hard-depend on `@nestjs/schedule`. On init, IF both
 *
 * - a `SchedulerRegistry` is resolvable from DI (the app imported `ScheduleModule.forRoot()`), and
 * - the `cron` package is installed (it ships with `@nestjs/schedule`), and
 * - a `dailyCron`/`weeklyCron` expression is configured in {@link DigestOptions},
 *
 * it registers a cron job that calls `flushDigests`. When `@nestjs/schedule` is absent the
 * scheduler is a no-op — call `flushDigests` from your own scheduler/tests instead, unchanged.
 */
@Injectable()
export class DigestScheduler implements OnModuleInit {
  private readonly logger = new Logger('NotificationsDigest');

  constructor(
    private readonly collector: DigestCollector,
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(DIGEST_OPTIONS) private readonly options: DigestOptions = {},
  ) {}

  onModuleInit(): void {
    if (!this.options.dailyCron && !this.options.weeklyCron) return;

    const registry = this.resolveSchedulerRegistry();
    if (!registry) {
      this.logger.warn(
        'Digest cron is configured but @nestjs/schedule is not available — skipping cron wiring. ' +
          'Import ScheduleModule.forRoot(), or call flushDigests() from your own scheduler.',
      );
      return;
    }
    const CronJob = loadCronJob();
    if (!CronJob) {
      this.logger.warn(
        'Digest cron is configured but the "cron" package is not available — skipping cron wiring.',
      );
      return;
    }

    if (this.options.dailyCron) {
      this.register(registry, CronJob, 'notifications-digest-daily', this.options.dailyCron, () =>
        this.collector.flushDigests('daily'),
      );
    }
    if (this.options.weeklyCron) {
      this.register(registry, CronJob, 'notifications-digest-weekly', this.options.weeklyCron, () =>
        this.collector.flushDigests('weekly'),
      );
    }
  }

  private register(
    registry: SchedulerRegistryLike,
    CronJob: CronJobCtor,
    name: string,
    cronTime: string,
    run: () => Promise<unknown>,
  ): void {
    const job = new CronJob(
      cronTime,
      () => {
        run().catch((error) =>
          this.logger.error(`Digest cron "${name}" failed: ${describe(error)}`),
        );
      },
      null,
      true,
    );
    registry.addCronJob(name, job);
    this.logger.log(`Registered digest cron "${name}" (${cronTime}).`);
  }

  /** Resolve `@nestjs/schedule`'s SchedulerRegistry from DI without importing the package. */
  private resolveSchedulerRegistry(): SchedulerRegistryLike | undefined {
    try {
      // SchedulerRegistry registers itself as a provider keyed by its own class; we resolve by the
      // soft-loaded class token so we never import @nestjs/schedule at build time.
      const mod = softRequire('@nestjs/schedule');
      if (!mod?.SchedulerRegistry) return undefined;
      return this.moduleRef.get(mod.SchedulerRegistry, { strict: false }) as SchedulerRegistryLike;
    } catch {
      return undefined;
    }
  }
}

/** Soft-load the `cron` package's CronJob (ships with @nestjs/schedule); undefined if absent. */
function loadCronJob(): CronJobCtor | undefined {
  const mod = softRequire('cron');
  return mod?.CronJob as CronJobCtor | undefined;
}

/** Runtime require that returns undefined instead of throwing when the module isn't installed. */
function softRequire(id: string): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(id);
  } catch {
    return undefined;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
