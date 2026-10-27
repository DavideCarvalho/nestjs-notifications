import {
  type ChannelGateContext,
  type GateDecision,
  type PreferenceGate,
  notifiableRef,
} from '@dudousxd/nestjs-notifications-core';
import { Injectable } from '@nestjs/common';
import { CategoryRegistry } from './category-registry';
import type { PreferenceMatrix } from './preference-center.interfaces';
import { PreferenceCenterService } from './preference-center.service';

/**
 * Core {@link PreferenceGate} backed by the {@link PreferenceCenterService}. Bound to the core
 * `NOTIFICATION_PREFERENCE_GATE` token by {@link PreferencesModule.forCenter} so the
 * ChannelRunner consults it before every delivery.
 *
 * For each delivery it resolves:
 * - the notification's **category** (its `category` property, else `general`),
 * - the **channel** being attempted,
 * - the notifiable **ref** + **tenant** from the gate context,
 *
 * then asks the service whether instant delivery is allowed:
 * - **Mandatory** categories (e.g. `security`) are always allowed.
 * - A disabled (category × channel) toggle blocks the channel.
 * - **Digest suppression:** when the category's digest is not `instant` (`daily`/`weekly`/
 *   `off`), instant delivery on every channel is SUPPRESSED. For an ENABLED channel on a
 *   `daily`/`weekly` cadence the gate returns `skip` carrying a `digest` cadence, so the runner
 *   COLLECTS the notification into a periodic digest (via the bound {@link DigestSink}) instead
 *   of dropping it; the {@link DigestCollector} flushes the batch at the chosen cadence. `off`
 *   and disabled channels remain a true skip (drop).
 */
@Injectable()
export class PreferenceCenterGate implements PreferenceGate {
  /**
   * Stored-matrix reads in flight, per (notification, notifiable, tenant). The runner gates every
   * channel of one delivery at once, so they share one store read instead of one per channel.
   * An entry lives only until its read settles, so later deliveries always read fresh values.
   */
  private readonly inFlight = new WeakMap<
    object,
    WeakMap<object, Map<string | undefined, Promise<PreferenceMatrix>>>
  >();

  constructor(
    private readonly service: PreferenceCenterService,
    private readonly registry: CategoryRegistry,
  ) {}

  async isAllowed(context: ChannelGateContext): Promise<boolean> {
    return (await this.evaluate(context)).action === 'allow';
  }

  /**
   * Rich decision used by the core runner. Resolves the (category × channel) preference; when the
   * resolution carries a `deferUntil` (the notifiable is inside quiet hours) the channel is
   * deferred (re-queued) rather than skipped — otherwise allow/skip as before. A notifiable
   * without a stable reference, and mandatory categories, always `allow`.
   */
  async evaluate({
    notifiable,
    notification,
    channel,
    tenant,
  }: ChannelGateContext): Promise<GateDecision> {
    let ref: { type: string; id: string | number };
    try {
      ref = notifiableRef(notifiable);
    } catch {
      // No stable reference (e.g. an anonymous notifiable) — nothing to gate against; allow.
      return { action: 'allow' };
    }

    const category = this.registry.resolve(notification);
    const { allowed, deferUntil, digest, digestEligible } = await this.service.resolveWith(
      () =>
        this.sharedRead(notification, notifiable, tenant, () =>
          this.service.storedMatrix({ type: ref.type, id: String(ref.id) }, tenant),
        ),
      category,
      channel,
    );
    if (allowed) return { action: 'allow' };
    if (deferUntil !== undefined) return { action: 'defer', deferUntil };
    // Non-instant cadence on an enabled channel: skip instant delivery but signal that the
    // notification should be COLLECTED into a periodic digest (the runner forwards it to the
    // bound DigestSink) rather than silently lost. `daily`/`weekly` only — `off` and disabled
    // channels are a true skip (drop).
    if (digestEligible && (digest === 'daily' || digest === 'weekly')) {
      return { action: 'skip', digest: { cadence: digest, category } };
    }
    return { action: 'skip' };
  }

  /** Join the in-flight read for this (notification, notifiable, tenant), or start one. */
  private sharedRead(
    notification: object,
    notifiable: object,
    tenant: string | undefined,
    read: () => Promise<PreferenceMatrix>,
  ): Promise<PreferenceMatrix> {
    let byNotifiable = this.inFlight.get(notification);
    if (!byNotifiable) {
      byNotifiable = new WeakMap();
      this.inFlight.set(notification, byNotifiable);
    }
    let byTenant = byNotifiable.get(notifiable);
    if (!byTenant) {
      byTenant = new Map();
      byNotifiable.set(notifiable, byTenant);
    }
    const pending = byTenant.get(tenant);
    if (pending) return pending;
    const started = read();
    byTenant.set(tenant, started);
    const forget = (): void => {
      if (byTenant.get(tenant) === started) byTenant.delete(tenant);
    };
    started.then(forget, forget);
    return started;
  }
}
