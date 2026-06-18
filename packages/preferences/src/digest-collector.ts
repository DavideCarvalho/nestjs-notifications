import {
  type Notifiable,
  type Notification,
  NotificationSerializer,
  NotificationService,
  type ScopedNotifier,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  DefaultDigestNotification,
  type DigestContext,
  type DigestItem,
  type DigestNotificationFactory,
} from './digest-notification';
import type {
  DigestCadence,
  PendingDigestEntry,
  PendingDigestGroup,
  PendingDigestStore,
} from './digest.interfaces';
import { PreferenceCenterService } from './preference-center.service';
import { evaluateQuietHours } from './quiet-hours';
import { DIGEST_OPTIONS, PENDING_DIGEST_STORE } from './tokens';

/** Result of one {@link DigestCollector.flushDigests} run, for logging/testing. */
export interface DigestFlushResult {
  cadence: DigestCadence;
  /** Digests actually dispatched. */
  sent: number;
  /** Groups skipped because every channel was deferred by quiet hours (kept for the next run). */
  deferred: number;
  /** Pending entries cleared (flushed). */
  cleared: number;
  /** True when the window was already flushed (idempotent no-op). */
  alreadyRun: boolean;
}

/** Behaviour knobs for the digest feature, provided via {@link PreferencesModule.forDigest}. */
export interface DigestOptions {
  /**
   * Customize the summary notification built per group. Return your own {@link Notification}
   * class (with `toMail`/`toDatabase`/…). Omitted → {@link DefaultDigestNotification}.
   */
  buildDigest?: DigestNotificationFactory;
  /**
   * When set, the digest dispatch is restricted to these channels (e.g. only deliver digests by
   * mail). Omitted → the recipient's normally-enabled channels for the category decide.
   */
  channels?: string[];
  /** Optional cron expression for the daily window (used only when @nestjs/schedule is wired). */
  dailyCron?: string;
  /** Optional cron expression for the weekly window (used only when @nestjs/schedule is wired). */
  weeklyCron?: string;
}

/**
 * Collects notifications suppressed by a non-instant cadence and flushes them as periodic digests.
 *
 * `flushDigests(cadence, now?)` is the pluggable trigger: call it from {@link DigestScheduler}
 * (wired to `@nestjs/schedule` when present), from an external scheduler, or directly in tests. It:
 *
 * 1. takes a per-window idempotency lock (so re-running a window doesn't double-send),
 * 2. reads pending entries grouped by `(tenant, notifiable, category)`,
 * 3. rebuilds each suppressed notification, builds one {@link DigestNotification} per group,
 * 4. dispatches it instantly through the normal pipeline (to the recipient's enabled channels),
 *    while RESPECTING quiet hours (a group inside the window is left pending for the next run),
 * 5. clears the flushed entries.
 */
@Injectable()
export class DigestCollector {
  private readonly logger = new Logger('NotificationsDigest');

  constructor(
    @Inject(PENDING_DIGEST_STORE) private readonly store: PendingDigestStore,
    private readonly notifications: NotificationService,
    private readonly serializer: NotificationSerializer,
    @Optional() private readonly preferences?: PreferenceCenterService,
    @Optional() @Inject(DIGEST_OPTIONS) private readonly options: DigestOptions = {},
  ) {}

  /**
   * Flush all pending digests for `cadence`. Idempotent per window: the window key is derived
   * from `now` (the calendar day for `daily`, the ISO week for `weekly`), so a second call for the
   * same window is a no-op. `now` is injectable for deterministic tests.
   */
  async flushDigests(cadence: DigestCadence, now: Date = new Date()): Promise<DigestFlushResult> {
    const windowKey = windowKeyFor(cadence, now);
    if (this.store.tryLockWindow) {
      const acquired = await this.store.tryLockWindow(cadence, windowKey);
      if (!acquired) {
        return { cadence, sent: 0, deferred: 0, cleared: 0, alreadyRun: true };
      }
    }

    const groups = await this.store.listGroups(cadence);
    let sent = 0;
    let deferred = 0;
    const toClear: string[] = [];

    for (const group of groups) {
      const heldForQuietHours = await this.isInQuietHours(group, now);
      if (heldForQuietHours) {
        deferred++;
        continue;
      }
      const dispatched = await this.dispatchGroup(group);
      if (dispatched) {
        sent++;
        for (const entry of group.entries) toClear.push(entry.id);
      } else {
        deferred++;
      }
    }

    if (toClear.length > 0) await this.store.clear(toClear);
    return { cadence, sent, deferred, cleared: toClear.length, alreadyRun: false };
  }

  /** Build and dispatch one group's digest. Returns false (group kept) if the recipient can't be resolved. */
  private async dispatchGroup(group: PendingDigestGroup): Promise<boolean> {
    let notifiable: Notifiable;
    try {
      notifiable = await this.serializer.resolveNotifiable(group.notifiable);
    } catch (error) {
      this.logger.warn(
        `Cannot resolve notifiable ${group.notifiable.type}#${group.notifiable.id} for ${group.cadence} digest — keeping it pending. ${describe(error)}`,
      );
      return false;
    }

    const context = this.toContext(group);
    const digest: Notification = this.options.buildDigest
      ? this.options.buildDigest(context)
      : new DefaultDigestNotification(context);

    // Force inline (instant) delivery of the digest itself — it IS the batch. Scope to the
    // group's tenant, and (optionally) restrict to the configured digest channels.
    const sender = this.scopedSender(group.tenantId, this.options.channels);
    await sender.sendNow(notifiable, digest);
    return true;
  }

  /** A {@link NotificationService} scoped to the group's tenant (and optionally to channels). */
  private scopedSender(tenantId: string | null, channels?: string[]): ScopedNotifier {
    // `.except([])` is a no-op scope that yields a chainable ScopedNotifier for the untenanted case.
    let sender: ScopedNotifier =
      tenantId != null ? this.notifications.forTenant(tenantId) : this.notifications.except([]);
    if (channels && channels.length > 0) sender = sender.only(channels);
    return sender;
  }

  /** Map a stored group to the renderer-facing {@link DigestContext}, rebuilding each item. */
  private toContext(group: PendingDigestGroup): DigestContext {
    const items: DigestItem[] = group.entries.map((entry: PendingDigestEntry) => ({
      notification: this.rebuild(entry),
      serialized: entry.notification,
      createdAt: entry.createdAt,
    }));
    return {
      notifiable: group.notifiable,
      tenantId: group.tenantId,
      category: group.category,
      cadence: group.cadence,
      items,
    };
  }

  /** Rebuild a stored notification, falling back to a plain holder when its class isn't registered. */
  private rebuild(entry: PendingDigestEntry): Notification {
    try {
      return this.serializer.deserializeNotification(entry.notification);
    } catch {
      // Not listed in NotificationsModule.forRoot({ notifications }) — expose the raw data so a
      // custom renderer can still read it, rather than failing the whole digest.
      return { ...(entry.notification.data as Record<string, unknown>) } as Notification;
    }
  }

  /**
   * Whether the recipient is currently inside quiet hours for this category — if so the group is
   * kept pending for a later run rather than delivered now. No preference service bound (or no
   * quiet hours stored) → never held.
   */
  private async isInQuietHours(group: PendingDigestGroup, now: Date): Promise<boolean> {
    if (!this.preferences) return false;
    try {
      const matrix = await this.preferences.getMatrix(
        group.notifiable,
        group.tenantId ?? undefined,
      );
      const quiet = matrix.categories[group.category]?.quietHours ?? matrix.quietHours;
      if (!quiet) return false;
      return evaluateQuietHours(quiet, now).active;
    } catch {
      return false;
    }
  }
}

/** The calendar-day (daily) or ISO-week (weekly) bucket key for idempotency, computed in UTC. */
function windowKeyFor(cadence: DigestCadence, now: Date): string {
  if (cadence === 'daily') {
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  }
  return isoWeekKey(now);
}

/** ISO-8601 week key (`YYYY-Www`) in UTC. */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week decides the year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
