import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChannelRegistry } from './channel-registry';
import type { CapturedContext } from './context-accessor';
import { injectServices } from './decorators';
import { ChannelNotRegisteredError } from './errors';
import { NotificationFailedEvent, NotificationSendingEvent, NotificationSentEvent } from './events';
import type {
  ChannelResult,
  DeliveryContext,
  DigestSink,
  DispatchDriver,
  GateDecision,
  Notifiable,
  Notification,
  PreferenceGate,
} from './interfaces';
import { LocalizationService } from './localization.service';
import type { NotificationsModuleOptions } from './options';
import {
  NOTIFICATION_DIGEST_SINK,
  NOTIFICATION_DISPATCHER,
  NOTIFICATION_OPTIONS,
  NOTIFICATION_PREFERENCE_GATE,
  NotificationEvents,
} from './tokens';

/**
 * Runs a notification across its channels and emits lifecycle events. This is the shared
 * delivery engine: the synchronous dispatcher calls it inline, and async workers call it
 * after rehydrating the job.
 *
 * Error policy:
 * - `failFast`: deliver sequentially and rethrow on the first channel failure.
 * - `continueOnError` (default): deliver to every channel; failures are logged and
 *   surfaced through the `notification.failed` event rather than thrown.
 */
@Injectable()
export class ChannelRunner {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly registry: ChannelRegistry,
    private readonly events: EventEmitter2,
    private readonly moduleRef: ModuleRef,
    @Inject(NOTIFICATION_OPTIONS)
    private readonly options: NotificationsModuleOptions,
    @Optional()
    @Inject(NOTIFICATION_PREFERENCE_GATE)
    private readonly gate?: PreferenceGate,
    @Optional()
    private readonly localization?: LocalizationService,
    @Optional()
    @Inject(NOTIFICATION_DIGEST_SINK)
    private readonly digestSink?: DigestSink,
  ) {}

  async run(
    notifiable: Notifiable,
    notification: Notification,
    channels: string[],
    context: DeliveryContext = {},
  ): Promise<ChannelResult[]> {
    // Populate @InjectService properties from the container (no-op if there are none).
    injectServices(notification, this.moduleRef);

    // Resolve the per-delivery localization (locale + translator) once, unless already provided
    // (e.g. by a custom dispatcher). No-op when the localization service isn't bound.
    const ctx: DeliveryContext =
      !context.localization && this.localization
        ? { ...context, localization: await this.localization.forNotifiable(notifiable) }
        : context;

    const failFast = this.options.errorPolicy === 'failFast';

    if (failFast) {
      const results: ChannelResult[] = [];
      for (const channel of channels) {
        results.push(await this.deliver(notifiable, notification, channel, true, ctx));
      }
      return results;
    }

    const settled = await Promise.allSettled(
      channels.map((channel) => this.deliver(notifiable, notification, channel, false, ctx)),
    );
    return settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : { channel: channels[i] ?? 'unknown', status: 'failed' as const, error: s.reason },
    );
  }

  private async deliver(
    notifiable: Notifiable,
    notification: Notification,
    channel: string,
    rethrow: boolean,
    context: DeliveryContext,
  ): Promise<ChannelResult> {
    // shouldSend gate (Laravel parity): skip this channel when it returns false.
    if (
      typeof notification.shouldSend === 'function' &&
      !notification.shouldSend(notifiable, channel)
    ) {
      return { channel, status: 'skipped' };
    }

    // Preferences gate (app-wide, e.g. per-user/per-tenant opt-out, quiet hours).
    // Bypassed for channels that were already deferred and re-queued (so they don't loop).
    const alreadyDeferred = context.deferredChannels?.includes(channel) ?? false;
    if (this.gate && !alreadyDeferred) {
      const decision = await this.evaluateGate(notifiable, notification, channel, context);
      if (decision.action === 'skip') {
        // A skip carrying a digest cadence is NOT a drop: the channel is suppressed for instant
        // delivery, but the notification is collected into a periodic digest (sent later in a
        // batch). Absent a bound sink it falls back to the legacy drop, unchanged.
        if (decision.digest && this.digestSink) {
          await this.digestSink.collect({
            notifiable,
            notification,
            channel,
            cadence: decision.digest.cadence,
            category: decision.digest.category,
            tenant: context.tenant,
          });
        }
        return { channel, status: 'skipped' };
      }
      if (decision.action === 'defer') {
        return this.deferChannel(notifiable, notification, channel, context, decision);
      }
    }

    const driver = this.registry.get(channel);
    if (!driver) {
      const err = new ChannelNotRegisteredError(channel, this.registry.names());
      this.emitFailed(
        notifiable,
        notification,
        channel,
        err,
        context.tenant,
        undefined,
        context.captured,
      );
      if (rethrow) throw err;
      this.logger.error(err.message);
      return { channel, status: 'failed', error: err };
    }

    this.events.emit(
      NotificationEvents.sending,
      new NotificationSendingEvent(
        notifiable,
        notification,
        channel,
        context.tenant,
        context.captured,
      ),
    );

    const startedAt = Date.now();
    try {
      const response = await driver.send(notifiable, notification, context);
      this.events.emit(
        NotificationEvents.sent,
        new NotificationSentEvent(
          notifiable,
          notification,
          channel,
          context.tenant,
          Date.now() - startedAt,
          response,
          context.captured,
        ),
      );
      if (typeof notification.afterSending === 'function') {
        await notification.afterSending(notifiable, channel, response);
      }
      return { channel, status: 'sent', response };
    } catch (error) {
      this.emitFailed(
        notifiable,
        notification,
        channel,
        error,
        context.tenant,
        Date.now() - startedAt,
        context.captured,
      );
      this.logger.error(`Channel "${channel}" failed: ${describe(error)}`);
      if (rethrow) throw error;
      return { channel, status: 'failed', error };
    }
  }

  /**
   * Consult the gate. Prefers the richer {@link PreferenceGate.evaluate} (allow/skip/defer);
   * falls back to the boolean {@link PreferenceGate.isAllowed} (`true` → allow, `false` → skip)
   * so existing boolean gates behave exactly as before.
   */
  private async evaluateGate(
    notifiable: Notifiable,
    notification: Notification,
    channel: string,
    context: DeliveryContext,
  ): Promise<GateDecision> {
    const gate = this.gate as PreferenceGate;
    const ctx = { notifiable, notification, channel, tenant: context.tenant };
    if (typeof gate.evaluate === 'function') {
      return gate.evaluate(ctx);
    }
    const allowed = await gate.isAllowed(ctx);
    return { action: allowed ? 'allow' : 'skip' };
  }

  /**
   * Re-queue a single channel deferred by the gate (e.g. quiet hours) through the async
   * dispatcher with a delay so it delivers after the window. The re-queued job carries
   * `deferredChannels` so the gate is bypassed on redelivery (no infinite defer loop). The
   * dispatcher is resolved lazily to avoid a DI cycle (SyncDispatcher depends on this runner).
   */
  private async deferChannel(
    notifiable: Notifiable,
    notification: Notification,
    channel: string,
    context: DeliveryContext,
    decision: GateDecision,
  ): Promise<ChannelResult> {
    const dispatcher = this.moduleRef.get<DispatchDriver>(NOTIFICATION_DISPATCHER, {
      strict: false,
    });
    const delay =
      decision.deferUntil !== undefined ? Math.max(0, decision.deferUntil - Date.now()) : undefined;
    await dispatcher.dispatch({
      notifiable,
      notification,
      channels: [channel],
      delay,
      tenant: context.tenant,
      captured: context.captured,
      deferredChannels: [channel],
    });
    return { channel, status: 'deferred' };
  }

  private emitFailed(
    notifiable: Notifiable,
    notification: Notification,
    channel: string,
    error: unknown,
    tenant?: string,
    durationMs?: number,
    captured?: CapturedContext,
  ): void {
    this.events.emit(
      NotificationEvents.failed,
      new NotificationFailedEvent(
        notifiable,
        notification,
        channel,
        error,
        tenant,
        durationMs,
        captured,
      ),
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
