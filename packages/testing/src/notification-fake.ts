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
  ScopedNotifier,
  SendResult,
  SendScope,
} from '@dudousxd/nestjs-notifications-core';
import { Injectable } from '@nestjs/common';

/** A single recorded send captured by {@link NotificationFake}. */
export interface SentNotificationRecord {
  notifiable: Notifiable;
  notification: Notification;
  channels: string[];
  mode: 'sync' | 'async';
  /** Tenant the send was scoped to, when multi-tenant (`undefined` = single-tenant). */
  tenant?: string | undefined;
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
    // PendingNotification calls `service.sendScoped(...)`, which this fake implements with the
    // same signature; the cast bridges the structural gap.
    return new PendingNotification(this as unknown as NotificationService, channel, routeValue);
  }

  /** @internal Used by {@link PendingNotification} and tenant/channel scoping. */
  sendScoped(
    notifiables: Notifiable | Notifiable[],
    notification: NotificationInput,
    scope: SendScope = {},
  ): Promise<SendResult[]> {
    const n = notification as Notification;
    const mode = n.shouldQueue || n.delay !== undefined ? 'async' : 'sync';
    return this.record(notifiables, n, mode, scope);
  }

  /** Scope recorded sends to a single tenant — mirrors {@link NotificationService.forTenant}. */
  forTenant(tenant: string): ScopedNotifier {
    return this.scoped({ tenants: [tenant] });
  }

  /** Scope recorded sends to several tenants. */
  forTenants(tenants: string[]): ScopedNotifier {
    return this.scoped({ tenants });
  }

  /** Record only these channels — mirrors {@link NotificationService.only}. */
  only(channels: string[]): ScopedNotifier {
    return this.scoped({ only: channels });
  }

  /** Drop these channels — mirrors {@link NotificationService.except}. */
  except(channels: string[]): ScopedNotifier {
    return this.scoped({ except: channels });
  }

  private scoped(scope: SendScope): ScopedNotifier {
    const merge = (extra: SendScope): ScopedNotifier => {
      const except =
        scope.except || extra.except
          ? [...(scope.except ?? []), ...(extra.except ?? [])]
          : undefined;
      return this.scoped({
        tenants: extra.tenants ?? scope.tenants,
        only: extra.only ?? scope.only,
        except,
      });
    };
    return {
      forTenant: (tenant) => merge({ tenants: [tenant] }),
      forTenants: (tenants) => merge({ tenants }),
      only: (channels) => merge({ only: channels }),
      except: (channels) => merge({ except: channels }),
      send: (n, notif) =>
        this.record(n as Notifiable | Notifiable[], notif as Notification, 'sync', scope),
      notify: (n, notif) =>
        this.record(n as Notifiable | Notifiable[], notif as Notification, 'sync', scope),
      sendNow: (n, notif) =>
        this.record(n as Notifiable | Notifiable[], notif as Notification, 'sync', scope),
      sendAsync: (n, notif) =>
        this.record(n as Notifiable | Notifiable[], notif as Notification, 'async', scope),
      route: (channel, routeValue) =>
        new PendingNotification(this as unknown as NotificationService, channel, routeValue, scope),
    };
  }

  private async record(
    notifiables: Notifiable | Notifiable[],
    notification: Notification,
    mode: 'sync' | 'async',
    scope: SendScope = {},
  ): Promise<SendResult[]> {
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    const status = mode === 'async' ? ('queued' as const) : ('sent' as const);
    const scopes = scope.tenants ?? [undefined];
    const out: SendResult[] = [];
    for (const notifiable of targets) {
      const channels = this.filterChannels(this.channelsFor(notification, notifiable), scope);
      for (const tenant of scopes) {
        this.records.push({ notifiable, notification, channels, mode, tenant });
        out.push({ notifiable, results: channels.map((channel) => ({ channel, status })), tenant });
      }
    }
    return out;
  }

  private filterChannels(channels: string[], scope: SendScope): string[] {
    let result = channels;
    if (scope.only) {
      const allow = new Set(scope.only);
      result = result.filter((c) => allow.has(c));
    }
    if (scope.except && scope.except.length > 0) {
      const deny = new Set(scope.except);
      result = result.filter((c) => !deny.has(c));
    }
    return result;
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
