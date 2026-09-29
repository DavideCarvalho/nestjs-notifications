import {
  BaseChannel,
  type ChannelContext,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { PushMessage } from './push-message';
import { PUSH_INVALID_TOKEN_CALLBACK, PUSH_TRANSPORT, PUSH_TRANSPORT_RESOLVER } from './tokens';
import {
  type InvalidTokenCallback,
  PushDeliveryError,
  type PushDeliveryResult,
  type PushTargetFailure,
  type PushTransport,
} from './transport';

/** Resolves a per-tenant {@link PushTransport} from a tenant id. */
export type PushTransportResolver = (tenant: string) => PushTransport | Promise<PushTransport>;

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
 *
 * Resolves to a {@link PushDeliveryResult} (`{ targets, delivered, invalidTargets, failures }`).
 * Error behaviour:
 * - a single target: the transport's error propagates (the delivery is `failed`);
 * - an array: every target is attempted. Per-target errors (from `send`, or reported by
 *   `sendMany` as `failures`) are collected into the result instead of aborting the rest; if NO
 *   target was delivered and at least one failed, a {@link PushDeliveryError} is thrown (carrying
 *   the per-target errors) so the delivery is reported as `failed`. Invalid tokens alone never
 *   throw — they're reported to `onInvalidTokens` for pruning.
 */
@Injectable()
export class PushChannel extends BaseChannel {
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
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<PushDeliveryResult> {
    // The resolver may be async (e.g. per-tenant credentials from a database).
    const transport = await this.forTenant<PushTransport | Promise<PushTransport>>(
      this.transport,
      context,
      this.resolveTransport,
    );
    const target = routeFor(notifiable, 'push', notification);
    const message = this.buildPayload<PushMessage>(notification, notifiable, 'toPush', context);

    if (!Array.isArray(target)) {
      await transport.send(target, message);
      return { targets: 1, delivered: 1, invalidTargets: [], failures: [] };
    }
    if (target.length === 0) {
      return { targets: 0, delivered: 0, invalidTargets: [], failures: [] };
    }

    let invalidTargets: unknown[] = [];
    let failures: PushTargetFailure[] = [];
    if (typeof transport.sendMany === 'function') {
      // Prefer a single multicast round-trip when the transport supports it, and report any
      // permanently-invalid tokens back so the app can prune them.
      const batch = await transport.sendMany(target, message);
      invalidTargets = batch.invalidTargets ?? [];
      failures = batch.failures ?? [];
    } else {
      // No multicast: attempt every target; one failure doesn't stop the rest.
      for (const one of target) {
        try {
          await transport.send(one, message);
        } catch (error) {
          failures.push({ target: one, error });
        }
      }
    }

    await this.reportInvalid(notifiable, invalidTargets, context?.tenant);

    const delivered = Math.max(0, target.length - invalidTargets.length - failures.length);
    if (delivered === 0 && failures.length > 0) {
      throw new PushDeliveryError(
        `Push delivery failed for all ${target.length} target(s): ${failures
          .map((f) => describe(f.error))
          .join('; ')}`,
        failures,
        invalidTargets,
      );
    }
    if (failures.length > 0) {
      this.logger.warn(
        `Push delivery failed for ${failures.length} of ${target.length} target(s): ${failures
          .map((f) => describe(f.error))
          .join('; ')}`,
      );
    }
    return { targets: target.length, delivered, invalidTargets, failures };
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
