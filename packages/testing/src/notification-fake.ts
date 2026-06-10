import {
  AnonymousNotifiable,
  type NotificationService,
  PendingNotification,
  resolveChannels,
} from '@dudousxd/nestjs-notifications-core';
import type {
  Notifiable,
  Notification,
  NotificationInput,
  SendResult,
} from '@dudousxd/nestjs-notifications-core';
import { Injectable } from '@nestjs/common';

/** A single recorded send captured by {@link NotificationFake}. */
export interface SentNotificationRecord {
  notifiable: Notifiable;
  notification: Notification;
  channels: string[];
  mode: 'sync' | 'async';
}

/** Constructor type used by the class-based assertions. */
export type NotificationConstructor = new (...args: any[]) => Notification;

/**
 * A drop-in replacement for `NotificationService` for tests. Instead of delivering
 * notifications, it records every send and exposes Laravel-style assertions.
 *
 * ```ts
 * const fake = new NotificationFake();
 * await fake.send(user, new InvoicePaid());
 * fake.assertSentTo(user, InvoicePaid);
 * ```
 *
 * Wire it into a Nest test module via {@link provideNotificationFake} or
 * `.overrideProvider(NotificationService).useClass(NotificationFake)`.
 */
@Injectable()
export class NotificationFake {
  /** All recorded sends, in order. */
  readonly records: SentNotificationRecord[] = [];

  /**
   * Records a notification to one or many notifiables. Mode is derived from
   * `notification.shouldQueue` (async when true, sync otherwise).
   */
  async send(
    notifiables: Notifiable | Notifiable[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    const n = notification as Notification;
    const mode = n.shouldQueue || n.delay !== undefined ? 'async' : 'sync';
    return this.record(notifiables, n, mode);
  }

  /** Alias of {@link send}, matching `NotificationService.notify`. */
  notify(
    notifiables: Notifiable | Notifiable[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.send(notifiables, notification);
  }

  /** Records as a forced inline (sync) send. */
  async sendNow(
    notifiables: Notifiable | Notifiable[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.record(notifiables, notification as Notification, 'sync');
  }

  /** Records as a forced async (queued) send. */
  async sendAsync(
    notifiables: Notifiable | Notifiable[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.record(notifiables, notification as Notification, 'async');
  }

  /**
   * Begins an on-demand notification to a raw route value. The returned builder
   * records against an {@link AnonymousNotifiable} when `.notify()` is called.
   */
  route(channel: string, routeValue: unknown): PendingNotification {
    // PendingNotification only calls `service.send(notifiable, notification)`, which this
    // fake implements with the same signature; the cast bridges the structural gap.
    return new PendingNotification(this as unknown as NotificationService, channel, routeValue);
  }

  private record(
    notifiables: Notifiable | Notifiable[],
    notification: Notification,
    mode: 'sync' | 'async',
  ): SendResult[] {
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    const status = mode === 'async' ? ('queued' as const) : ('sent' as const);
    return targets.map((notifiable) => {
      const channels = this.channelsFor(notification, notifiable);
      this.records.push({ notifiable, notification, channels, mode });
      return { notifiable, results: channels.map((channel) => ({ channel, status })) };
    });
  }

  private channelsFor(notification: Notification, notifiable: Notifiable): string[] {
    try {
      return resolveChannels(notification, notifiable);
    } catch {
      return [];
    }
  }

  // --- assertions -----------------------------------------------------------

  /** Throws if any notification was recorded. */
  assertNothingSent(): void {
    if (this.records.length > 0) {
      throw new Error(
        `Expected no notifications to be sent, but ${this.records.length} were sent.`,
      );
    }
  }

  /** Throws unless the total number of recorded sends equals `n`. */
  assertCount(n: number): void {
    if (this.records.length !== n) {
      throw new Error(
        `Expected ${n} notification(s) to be sent, but ${this.records.length} were sent.`,
      );
    }
  }

  /** Throws unless exactly `n` records are instances of `notificationClass`. */
  assertSentTimes(notificationClass: NotificationConstructor, n: number): void {
    const count = this.records.filter((r) => r.notification instanceof notificationClass).length;
    if (count !== n) {
      throw new Error(
        `Expected ${notificationClass.name} to be sent ${n} time(s), but it was sent ${count} time(s).`,
      );
    }
  }

  /**
   * Throws unless at least one record matches `notificationClass` (and the optional
   * `predicate`).
   */
  assertSent(
    notificationClass: NotificationConstructor,
    predicate?: (record: SentNotificationRecord) => boolean,
  ): void {
    const matches = this.records.filter(
      (r) => r.notification instanceof notificationClass && (predicate ? predicate(r) : true),
    );
    if (matches.length === 0) {
      throw new Error(
        `Expected ${notificationClass.name} to have been sent${
          predicate ? ' matching the given predicate' : ''
        }, but it was not.`,
      );
    }
  }

  /**
   * Throws unless at least one `notificationClass` record was sent to the given target.
   * `target` may be a Notifiable (compared by reference) or a predicate over the notifiable.
   */
  assertSentTo(
    target: Notifiable | ((notifiable: Notifiable) => boolean),
    notificationClass: NotificationConstructor,
  ): void {
    const matchesTarget =
      typeof target === 'function'
        ? (n: Notifiable) => (target as (notifiable: Notifiable) => boolean)(n)
        : (n: Notifiable) => n === target;

    const found = this.records.some(
      (r) => r.notification instanceof notificationClass && matchesTarget(r.notifiable),
    );
    if (!found) {
      throw new Error(
        `Expected ${notificationClass.name} to have been sent to the given notifiable, but it was not.`,
      );
    }
  }

  /**
   * Throws unless some record's channels include `channel` (optionally restricted to
   * records of `notificationClass`).
   */
  assertSentOnChannel(channel: string, notificationClass?: NotificationConstructor): void {
    const found = this.records.some(
      (r) =>
        r.channels.includes(channel) &&
        (notificationClass ? r.notification instanceof notificationClass : true),
    );
    if (!found) {
      throw new Error(
        `Expected a notification${
          notificationClass ? ` (${notificationClass.name})` : ''
        } to have been sent on channel "${channel}", but none was.`,
      );
    }
  }

  /** Returns the recorded sends, optionally filtered to instances of `notificationClass`. */
  sent(notificationClass?: NotificationConstructor): SentNotificationRecord[] {
    if (!notificationClass) return [...this.records];
    return this.records.filter((r) => r.notification instanceof notificationClass);
  }

  /** Clears all recorded sends. */
  reset(): void {
    this.records.length = 0;
  }
}

/** Marker re-export so callers can build anonymous targets in custom assertions. */
export { AnonymousNotifiable };
