import {
  type ChannelGateContext,
  type PreferenceGate,
  notifiableRef,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { PreferenceStore } from './interfaces';
import { NOTIFICATION_PREFERENCE_STORE } from './tokens';

/**
 * Core {@link PreferenceGate} backed by a {@link PreferenceStore}. Bound to the core
 * `NOTIFICATION_PREFERENCE_GATE` token by {@link PreferencesModule} so the ChannelRunner
 * consults it before every delivery. Opt-out: a channel is allowed unless explicitly muted.
 */
@Injectable()
export class PreferenceGateAdapter implements PreferenceGate {
  constructor(@Inject(NOTIFICATION_PREFERENCE_STORE) private readonly store: PreferenceStore) {}

  async isAllowed({ notifiable, channel, tenant }: ChannelGateContext): Promise<boolean> {
    let ref: { type: string; id: string | number };
    try {
      ref = notifiableRef(notifiable);
    } catch {
      // No stable reference (e.g. an anonymous notifiable) — nothing to mute against; allow.
      return true;
    }
    return !(await this.store.isMuted({
      tenant,
      notifiableType: ref.type,
      notifiableId: String(ref.id),
      channel,
    }));
  }
}
