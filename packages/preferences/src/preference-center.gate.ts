import {
  type ChannelGateContext,
  type PreferenceGate,
  notifiableRef,
} from '@dudousxd/nestjs-notifications-core';
import { Injectable } from '@nestjs/common';
import { CategoryRegistry } from './category-registry';
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
 *   `off`), instant delivery on every channel is SUPPRESSED. A scheduled digest job (out of
 *   scope for this package) would collect the suppressed notifications and send them in a
 *   batch at the chosen cadence.
 */
@Injectable()
export class PreferenceCenterGate implements PreferenceGate {
  constructor(
    private readonly service: PreferenceCenterService,
    private readonly registry: CategoryRegistry,
  ) {}

  async isAllowed({
    notifiable,
    notification,
    channel,
    tenant,
  }: ChannelGateContext): Promise<boolean> {
    let ref: { type: string; id: string | number };
    try {
      ref = notifiableRef(notifiable);
    } catch {
      // No stable reference (e.g. an anonymous notifiable) — nothing to gate against; allow.
      return true;
    }

    const category = this.registry.resolve(notification);
    const { allowed } = await this.service.resolve(
      { type: ref.type, id: String(ref.id) },
      category,
      channel,
      tenant,
    );
    return allowed;
  }
}
