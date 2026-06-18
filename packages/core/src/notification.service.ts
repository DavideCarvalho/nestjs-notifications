import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ChannelRunner } from './channel-runner';
import { type ContextAccessor, captureContext } from './context-accessor';
import { resolveChannels, resolveTenants } from './decorators';
import { DispatchGuards } from './dispatch-guard.service';
import {
  type DeliveryConfirmation,
  type FallbackPolicy,
  deliveredFromResult,
  readFallback,
  runFallbackChain,
} from './fallback-chain';
import type {
  CapturedContext,
  ChannelResult,
  DispatchDriver,
  Notifiable,
  NotifiableInput,
  Notification,
  NotificationInput,
  SendResult,
} from './interfaces';
import { PendingNotification } from './pending-notification';
import {
  CONTEXT_ACCESSOR,
  NOTIFICATION_DELIVERY_CONFIRMATION,
  NOTIFICATION_DISPATCHER,
} from './tokens';

type Mode = 'auto' | 'sync' | 'async';

/** A delivery scope: which tenants to fan out to, and which channels to keep/drop. */
export interface SendScope {
  tenants?: string[] | undefined;
  /** When set, only these channels are delivered (ad-hoc allow-list). */
  only?: string[] | undefined;
  /** When set, these channels are dropped from delivery (ad-hoc deny-list). */
  except?: string[] | undefined;
}

/**
 * A scoped sender — same surface as {@link NotificationService} plus chainable scope refiners.
 * Returned by `forTenant`, `forTenants`, `only` and `except`; the refiners compose:
 *
 * ```ts
 * await notifications.forTenant('acme').only(['mail']).send(user, new InvoicePaid(invoice));
 * await notifications.except(['sms']).send(user, new Welcome());
 * ```
 */
export interface ScopedNotifier {
  /** Narrow to a single tenant. */
  forTenant(tenant: string): ScopedNotifier;
  /** Narrow to several tenants (the send fans out to each). */
  forTenants(tenants: string[]): ScopedNotifier;
  /** Deliver only these channels for this send (overrides any prior `only`). */
  only(channels: string[]): ScopedNotifier;
  /** Drop these channels for this send (merged with any prior `except`). */
  except(channels: string[]): ScopedNotifier;
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

/** @deprecated Use {@link ScopedNotifier}. Kept as an alias for backwards compatibility. */
export type TenantScopedNotifier = ScopedNotifier;

/**
 * Public API for sending notifications. Mirrors Laravel's `Notification` facade:
 *
 * ```ts
 * const [result] = await notifications.send(user, new InvoicePaid(invoice));
 * await notifications.forTenant('acme').send(user, new InvoicePaid(invoice));
 * await notifications.only(['mail']).send(user, new InvoicePaid(invoice));
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
    private readonly guards: DispatchGuards,
    // Soft-detected `@dudousxd/nestjs-context` accessor (optional peer; no hard import).
    // When bound, `send()` captures who/which-tenant/which-trace triggered the notification.
    @Optional()
    @Inject(CONTEXT_ACCESSOR)
    private readonly contextAccessor?: ContextAccessor,
    @Optional()
    private readonly moduleRef?: ModuleRef,
    // Optional probe for cross-channel fallback chains; absent → immediate result decides.
    @Optional()
    @Inject(NOTIFICATION_DELIVERY_CONFIRMATION)
    private readonly deliveryConfirmation?: DeliveryConfirmation,
  ) {}

  /**
   * Locate the context accessor. Prefers the value injected into this module; falls back to a
   * non-strict {@link ModuleRef} lookup so an accessor provided by ANY module (e.g. a global
   * ContextModule, or the app root) is found even though NotificationsModule is its own module.
   * Mirrors the authz Gate's resolution seam. Returns undefined when nestjs-context is absent.
   */
  private resolveContextAccessor(): ContextAccessor | undefined {
    if (this.contextAccessor) return this.contextAccessor;
    if (!this.moduleRef) return undefined;
    try {
      return this.moduleRef.get<ContextAccessor>(CONTEXT_ACCESSOR, { strict: false });
    } catch {
      return undefined;
    }
  }

  /** Send a notification, returning a per-(notifiable, tenant), per-channel {@link SendResult}. */
  send(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'auto', {});
  }

  /** Alias of {@link send}. */
  notify(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'auto', {});
  }

  /** Force inline delivery, ignoring `shouldQueue`/`delay` (Laravel's `sendNow`). */
  sendNow(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'sync', {});
  }

  /** Force delivery through the configured async dispatcher. */
  sendAsync(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'async', {});
  }

  /** Start an on-demand notification to a raw route value, with no Notifiable object. */
  route(channel: string, routeValue: unknown): PendingNotification {
    return new PendingNotification(this, channel, routeValue);
  }

  /** Scope all sends to a single tenant. */
  forTenant(tenant: string): ScopedNotifier {
    return this.scoped({ tenants: [tenant] });
  }

  /** Scope all sends to several tenants (the send fans out to each). */
  forTenants(tenants: string[]): ScopedNotifier {
    return this.scoped({ tenants });
  }

  /** Deliver only these channels (ad-hoc allow-list), regardless of the notification's `via()`. */
  only(channels: string[]): ScopedNotifier {
    return this.scoped({ only: channels });
  }

  /** Drop these channels from delivery (ad-hoc deny-list). */
  except(channels: string[]): ScopedNotifier {
    return this.scoped({ except: channels });
  }

  /** Build a chainable scoped sender over the given {@link SendScope}. */
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
      send: (n, notif) => this.dispatchAll(n, notif, 'auto', scope),
      notify: (n, notif) => this.dispatchAll(n, notif, 'auto', scope),
      sendNow: (n, notif) => this.dispatchAll(n, notif, 'sync', scope),
      sendAsync: (n, notif) => this.dispatchAll(n, notif, 'async', scope),
      route: (channel, routeValue) => new PendingNotification(this, channel, routeValue, scope),
    };
  }

  /** @internal Used by {@link PendingNotification}; honors an explicit scope. */
  sendScoped(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
    scope: SendScope = {},
  ): Promise<SendResult[]> {
    return this.dispatchAll(notifiables, notification, 'auto', scope);
  }

  private dispatchAll(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
    mode: Mode,
    scope: SendScope,
  ): Promise<SendResult[]> {
    const n = notification as Notification;
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    const async = mode === 'async' || (mode === 'auto' && (n.shouldQueue || n.delay !== undefined));

    // Snapshot the request context (who/tenant/trace) once at send() time, before any async
    // boundary. Undefined when nestjs-context is absent → fully unchanged behavior.
    const captured = captureContext(this.resolveContextAccessor());

    const jobs: Promise<SendResult>[] = [];
    for (const target of targets) {
      const notifiable = target as Notifiable;
      // explicit forTenant(s) wins; else @Tenant() on the notification/notifiable; else single.
      const tenants = scope.tenants ?? resolveTenants(n, notifiable) ?? [undefined];
      for (const tenant of tenants) {
        jobs.push(this.guardedDispatch(notifiable, n, tenant, scope, captured, async));
      }
    }
    return Promise.all(jobs);
  }

  /**
   * Run the dedup/throttle guards for one (notifiable, tenant), then dispatch. A duplicate is
   * reported as `suppressed`; a throttled send is `throttled` (dropped) unless its overflow is
   * `defer`, in which case it's re-queued through the async dispatcher after the throttle window.
   */
  private async guardedDispatch(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
    scope: SendScope,
    captured: CapturedContext | undefined,
    async: boolean,
  ): Promise<SendResult> {
    const decision = await this.guards.check(notifiable, notification, tenant);
    if (!decision.proceed) {
      if (decision.reason === 'throttled' && decision.overflow === 'defer') {
        return this.deferThrottled(notifiable, notification, tenant, scope, captured);
      }
      const status = decision.reason === 'duplicate' ? 'suppressed' : 'throttled';
      const channels = this.filterChannels(resolveChannels(notification, notifiable), scope);
      return { notifiable, results: channels.map((channel) => ({ channel, status })), tenant };
    }
    return async
      ? this.sendAsyncTo(notifiable, notification, tenant, scope, captured)
      : this.sendNowTo(notifiable, notification, tenant, scope, captured);
  }

  /** Re-queue a throttled-but-deferred delivery through the async dispatcher. */
  private async deferThrottled(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
    scope: SendScope,
    captured: CapturedContext | undefined,
  ): Promise<SendResult> {
    const channels = this.filterChannels(resolveChannels(notification, notifiable), scope);
    if (channels.length === 0) return { notifiable, results: [], tenant };
    await this.dispatcher.dispatch({
      notifiable,
      notification,
      channels,
      queue: notification.queue,
      delay: toDelayMs(notification.delay),
      tenant,
      captured,
    });
    return {
      notifiable,
      results: channels.map((channel) => ({ channel, status: 'queued' as const })),
      tenant,
    };
  }

  /** Apply the ad-hoc `only`/`except` channel filters from a {@link SendScope}. */
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

  private async sendNowTo(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
    scope: SendScope,
    captured: CapturedContext | undefined,
  ): Promise<SendResult> {
    const channels = this.filterChannels(resolveChannels(notification, notifiable), scope);
    if (channels.length === 0) return { notifiable, results: [], tenant };

    // Opt-in cross-channel fallback: deliver as an ordered escalation chain instead of in parallel.
    const policy = readFallback(notification).fallback?.(notifiable);
    if (policy) {
      const results = await this.runFallback(
        notifiable,
        notification,
        policy,
        tenant,
        scope,
        captured,
      );
      return { notifiable, results, tenant };
    }

    const results = await this.runner.run(notifiable, notification, channels, { tenant, captured });
    return { notifiable, results, tenant };
  }

  /**
   * Deliver a notification as an ordered escalation chain: try each channel in turn, stopping at
   * the first that reaches the recipient. "Reached" is decided by the bound
   * {@link DeliveryConfirmation} probe when present, else by the immediate `sent` result.
   * Honors the ad-hoc `only`/`except` channel scope by filtering the chain.
   */
  private async runFallback(
    notifiable: Notifiable,
    notification: Notification,
    policy: FallbackPolicy,
    tenant: string | undefined,
    scope: SendScope,
    captured: CapturedContext | undefined,
  ): Promise<ChannelResult[]> {
    const chain = this.filterChannels(policy.channels, scope);
    const timeoutMs = policy.timeoutMs ?? 0;
    const { results } = await runFallbackChain(
      chain,
      async (channel) => {
        const [result] = await this.runner.run(notifiable, notification, [channel], {
          tenant,
          captured,
        });
        return result ?? { channel, status: 'failed' as const };
      },
      (result, channel) => {
        if (this.deliveryConfirmation) {
          return this.deliveryConfirmation.confirm({
            notifiable,
            notification,
            channel,
            tenant,
            timeoutMs,
            result,
          });
        }
        return deliveredFromResult(result);
      },
    );
    return results;
  }

  private async sendAsyncTo(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
    scope: SendScope,
    captured: CapturedContext | undefined,
  ): Promise<SendResult> {
    const channels = this.filterChannels(resolveChannels(notification, notifiable), scope);
    if (channels.length === 0) return { notifiable, results: [], tenant };
    // Pass live objects through; cross-process dispatchers serialize via NotificationSerializer.
    await this.dispatcher.dispatch({
      notifiable,
      notification,
      channels,
      queue: notification.queue,
      delay: toDelayMs(notification.delay),
      tenant,
      captured,
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
