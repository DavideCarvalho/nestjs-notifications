import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  type IdempotencyStore,
  InMemoryIdempotencyStore,
  InMemoryThrottleStore,
  type ThrottleOverflow,
  type ThrottleStore,
  idempotencyStoreKey,
  readIdempotency,
  readThrottle,
  throttleStoreKey,
} from './dispatch-guards';
import type { Notifiable, Notification } from './interfaces';
import type { NotificationsModuleOptions } from './options';
import {
  NOTIFICATION_IDEMPOTENCY_STORE,
  NOTIFICATION_OPTIONS,
  NOTIFICATION_THROTTLE_STORE,
} from './tokens';

/** Default dedup window when neither the notification nor the module specify one. */
const DEFAULT_TTL_MS = 60_000;

/** Outcome of consulting the guards for a single (notifiable, notification, tenant). */
export type GuardDecision =
  | { proceed: true }
  | { proceed: false; reason: 'duplicate' | 'throttled'; overflow?: ThrottleOverflow };

/**
 * Applies the dedup (idempotency) and throttle (rate-limit) guards in the core dispatch path.
 * Sits in front of both the sync and async send so the guarantees hold regardless of dispatcher.
 *
 * Backwards compatible: a notification that declares neither `idempotencyKey()` nor `throttle()`
 * always proceeds, and the stores are never touched.
 */
@Injectable()
export class DispatchGuards {
  private readonly logger = new Logger('Notifications');
  private readonly idempotency: IdempotencyStore;
  private readonly throttle: ThrottleStore;
  private readonly defaultTtlMs: number;
  private readonly defaultOverflow: ThrottleOverflow;

  constructor(
    @Inject(NOTIFICATION_OPTIONS)
    options: NotificationsModuleOptions,
    @Optional()
    @Inject(NOTIFICATION_IDEMPOTENCY_STORE)
    idempotencyStore?: IdempotencyStore,
    @Optional()
    @Inject(NOTIFICATION_THROTTLE_STORE)
    throttleStore?: ThrottleStore,
  ) {
    const guards = options.dispatchGuards ?? {};
    this.idempotency =
      idempotencyStore ?? guards.idempotency?.store ?? new InMemoryIdempotencyStore();
    this.throttle = throttleStore ?? guards.throttle?.store ?? new InMemoryThrottleStore();
    this.defaultTtlMs = guards.idempotency?.ttlMs ?? DEFAULT_TTL_MS;
    this.defaultOverflow = guards.throttle?.overflow ?? 'drop';
  }

  /**
   * Decide whether a delivery should proceed. Checks throttle first (cheap, frequent) then
   * idempotency. The idempotency key is only reserved once we know the send will proceed, so a
   * throttled send doesn't burn its dedup slot.
   */
  async check(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
  ): Promise<GuardDecision> {
    const throttled = await this.checkThrottle(notifiable, notification, tenant);
    if (throttled) return throttled;
    return this.checkIdempotency(notifiable, notification, tenant);
  }

  private async checkThrottle(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
  ): Promise<GuardDecision | undefined> {
    const config = readThrottle(notification).throttle?.(notifiable);
    if (!config || config.max <= 0) return undefined;
    const key = throttleStoreKey(notifiable, config.category, tenant);
    const count = await this.throttle.increment(key, config.windowMs);
    if (count > config.max) {
      return {
        proceed: false,
        reason: 'throttled',
        overflow: config.overflow ?? this.defaultOverflow,
      };
    }
    return undefined;
  }

  private async checkIdempotency(
    notifiable: Notifiable,
    notification: Notification,
    tenant: string | undefined,
  ): Promise<GuardDecision> {
    const aware = readIdempotency(notification);
    const rawKey = aware.idempotencyKey?.(notifiable);
    if (!rawKey) return { proceed: true };
    const scope = aware.idempotencyScope ?? 'notifiable';
    const ttlMs = aware.idempotencyTtlMs ?? this.defaultTtlMs;
    const key = idempotencyStoreKey(rawKey, notifiable, tenant, scope);
    const fresh = await this.idempotency.reserve(key, ttlMs);
    return fresh ? { proceed: true } : { proceed: false, reason: 'duplicate' };
  }
}
