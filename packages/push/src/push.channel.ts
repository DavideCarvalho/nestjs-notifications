import {
  type ChannelContext,
  type ChannelDriver,
  type DeliveryContext,
  MissingChannelMethodError,
  type Notifiable,
  type Notification,
  createChannel,
  getHandler,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { PushMessage } from './push-message';
import { PUSH_INVALID_TOKEN_CALLBACK, PUSH_TRANSPORT, PUSH_TRANSPORT_RESOLVER } from './tokens';
import type { InvalidTokenCallback, PushTransport } from './transport';

/** Resolves a per-tenant {@link PushTransport} from a tenant id. */
export type PushTransportResolver = (tenant: string) => PushTransport;

/** Channel handle: use as `@Push()` on a payload method, or as a token in `via()`. */
export const Push = createChannel('push');

/** Implement this on a notification to define its push payload. */
export interface PushNotification extends Notification {
  toPush(ctx: ChannelContext): PushMessage;
}

/**
 * Delivers a notification's {@link PushMessage} through the configured
 * {@link PushTransport}. The target(s) come from `routeNotificationFor('push')`:
 * a single device token / subscription, or an array of them (each gets the message).
 */
@Injectable()
export class PushChannel implements ChannelDriver {
  readonly channel = 'push';
  private readonly logger = new Logger('PushChannel');

  constructor(
    @Inject(PUSH_TRANSPORT)
    private readonly transport: PushTransport,
    @Optional()
    @Inject(PUSH_TRANSPORT_RESOLVER)
    private readonly resolveTransport?: PushTransportResolver,
    @Optional()
    @Inject(PUSH_INVALID_TOKEN_CALLBACK)
    private readonly onInvalidTokens?: InvalidTokenCallback,
  ) {}

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const transport =
      context?.tenant && this.resolveTransport
        ? this.resolveTransport(context.tenant)
        : this.transport;
    const target = routeFor(notifiable, 'push', notification);

    const handler = getHandler(notification, 'push', 'toPush');
    if (!handler) {
      const name =
        (notification.constructor as { notificationName?: string }).notificationName ??
        notification.constructor.name;
      throw new MissingChannelMethodError('push', 'toPush()', name);
    }

    const message = handler({
      notifiable,
      localization: context?.localization,
      tenant: context?.tenant,
    }) as PushMessage;

    if (Array.isArray(target)) {
      // Prefer a single multicast round-trip when the transport supports it, and report any
      // permanently-invalid tokens back so the app can prune them.
      if (typeof transport.sendMany === 'function' && target.length > 0) {
        const { invalidTargets } = await transport.sendMany(target, message);
        await this.reportInvalid(notifiable, invalidTargets, context?.tenant);
        return;
      }
      for (const one of target) {
        await transport.send(one, message);
      }
      return;
    }

    await transport.send(target, message);
  }

  /** Invoke the prune callback for invalid tokens; never let it break delivery. */
  private async reportInvalid(
    notifiable: Notifiable,
    invalidTargets: unknown[],
    tenant: string | undefined,
  ): Promise<void> {
    if (!this.onInvalidTokens || invalidTargets.length === 0) return;
    try {
      await this.onInvalidTokens({ notifiable, invalidTargets, tenant });
    } catch (error) {
      this.logger.error(
        `Invalid-token callback threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
