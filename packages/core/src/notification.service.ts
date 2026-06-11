import { Inject, Injectable } from '@nestjs/common';
import { ChannelRunner } from './channel-runner';
import { resolveChannels, resolveTenants } from './decorators';
import type {
  DispatchDriver,
  Notifiable,
  NotifiableInput,
  Notification,
  NotificationInput,
  SendResult,
} from './interfaces';
import { PendingNotification } from './pending-notification';
import { NOTIFICATION_DISPATCHER } from './tokens';

type Mode = 'auto' | 'sync' | 'async';

/** Send a notification scoped to one or more tenants — same surface as {@link NotificationService}. */
export interface TenantScopedNotifier {
  send(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]>;
  notify(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]>;
  sendNow(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]>;
  sendAsync(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]>;
  route(channel: string, routeValue: unknown): PendingNotification;
}

/**
 * Public API for sending notifications. Mirrors Laravel's `Notification` facade:
 *
 * ```ts
 * const [result] = await notifications.send(user, new InvoicePaid(invoice));
 * await notifications.forTenant('acme').send(user, new InvoicePaid(invoice));
 * await notifications.forTenants(['a', 'b']).send(user, new Announcement());
 * ```
 *
 * The tenant can also come from a `@Tenant()` property on the notification/notifiable, and may
 * be an array — the send then fans out to each tenant (one delivery + storage row per tenant).
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly runner: ChannelRunner,
    @Inject(NOTIFICATION_DISPATCHER)
    private readonly dispatcher: DispatchDriver,
  ) {}

  /** Send a notification, returning a per-(notifiable, tenant), per-channel {@link SendResult}. */
  send(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'auto', undefined);
  }

  /** Alias of {@link send}. */
  notify(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'auto', undefined);
  }

  /** Force inline delivery, ignoring `shouldQueue`/`delay` (Laravel's `sendNow`). */
  sendNow(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'sync', undefined);
  }

  /** Force delivery through the configured async dispatcher. */
  sendAsync(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'async', undefined);
  }

  /** Start an on-demand notification to a raw route value, with no Notifiable object. */
  route(channel: string, routeValue: unknown): PendingNotification {
    return new PendingNotification(this, channel, routeValue);
  }

  /** Scope all sends to a single tenant. */
  forTenant(tenant: string): TenantScopedNotifier {
    return this.forTenants([tenant]);
  }

  /** Scope all sends to several tenants (the send fans out to each). */
  forTenants(tenants: string[]): TenantScopedNotifier {
    return {
      send: (n, notif) => this.dispatchAll(n, notif, 'auto', tenants),
      notify: (n, notif) => this.dispatchAll(n, notif, 'auto', tenants),
      sendNow: (n, notif) => this.dispatchAll(n, notif, 'sync', tenants),
      sendAsync: (n, notif) => this.dispatchAll(n, notif, 'async', tenants),
      route: (channel, routeValue) => new PendingNotification(this, channel, routeValue, tenants),
    };
  }

  /** @internal Used by {@link PendingNotification}; honors an explicit tenant scope. */
  sendScoped(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
    tenants?: string[],
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'auto', tenants);
  }

  private dispatchAll(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
    mode: Mode,
    explicitTenants: string[] | undefined,
  ): Promise<SendResult[]> {
    const n = notification as Notification;
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    const async = mode === 'async' || (mode === 'auto' && (n.shouldQueue || n.delay !== undefined));

    const jobs: Promise<SendResult>[] = [];
    for (const target of targets) {
      const notifiable = target as Notifiable;
      // explicit forTenant(s) wins; else @Tenant() on the notification/notifiable; else single.
      const tenants = explicitTenants ?? resolveTenants(n, notifiable) ?? [undefined];
      for (const tenant of tenants) {
        jobs.push(
          async ? this.sendAsyncTo(notifiable, n, tenant) : this.sendNowTo(notifiable, n, tenant),
        );
      }
    }
    return Promise.all(jobs);
  }

  private async sendNowTo(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
  ): Promise<SendResult> {
    const channels = resolveChannels(notification, notifiable);
    if (channels.length === 0) return { notifiable, results: [], tenant };
    const results = await this.runner.run(notifiable, notification, channels, { tenant });
    return { notifiable, results, tenant };
  }

  private async sendAsyncTo(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
  ): Promise<SendResult> {
    const channels = resolveChannels(notification, notifiable);
    if (channels.length === 0) return { notifiable, results: [], tenant };
    // Pass live objects through; cross-process dispatchers serialize via NotificationSerializer.
    await this.dispatcher.dispatch({
      notifiable,
      notification,
      channels,
      queue: notification.queue,
      delay: toDelayMs(notification.delay),
      tenant,
    });
    return {
      notifiable,
      results: channels.map((channel) => ({ channel, status: 'queued' as const })),
      tenant,
    };
  }
}

/** Normalize a delay (ms number or absolute Date) to milliseconds from now. */
function toDelayMs(delay: number | Date | undefined): number | undefined {
  if (delay === undefined) return undefined;
  if (delay instanceof Date) return Math.max(0, delay.getTime() - Date.now());
  return Math.max(0, delay);
}
