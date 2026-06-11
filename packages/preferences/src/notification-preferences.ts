import {
  type Notifiable,
  type NotifiableRef,
  notifiableRef,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { PreferenceStore } from './interfaces';
import { NOTIFICATION_PREFERENCE_STORE } from './tokens';

/** A notifiable instance or a pre-built reference to one. */
export type PreferenceTarget = Notifiable | NotifiableRef;

/** Discriminate a {@link NotifiableRef} from a full {@link Notifiable}. */
function isRef(target: PreferenceTarget): target is NotifiableRef {
  return (
    typeof (target as NotifiableRef).type === 'string' &&
    (target as NotifiableRef).id !== undefined &&
    typeof (target as Notifiable).routeNotificationFor !== 'function' &&
    typeof (target as Notifiable).toNotifiableRef !== 'function'
  );
}

/** Normalize either input into a `{ notifiableType, notifiableId }` pair. */
function resolve(target: PreferenceTarget): { notifiableType: string; notifiableId: string } {
  const ref = isRef(target) ? (target as NotifiableRef) : notifiableRef(target as Notifiable);
  return { notifiableType: ref.type, notifiableId: String(ref.id) };
}

/**
 * The set of preference operations, optionally pre-scoped to a tenant. Returned both directly by
 * {@link NotificationPreferences} (tenant undefined) and by {@link NotificationPreferences.forTenant}.
 */
export interface ScopedPreferences {
  /** Mute a channel for the target. */
  mute(target: PreferenceTarget, channel: string): Promise<void>;
  /** Un-mute a channel for the target. */
  unmute(target: PreferenceTarget, channel: string): Promise<void>;
  /** Whether the channel is muted for the target. */
  isMuted(target: PreferenceTarget, channel: string): Promise<boolean>;
  /** List the channels currently muted for the target. */
  muted(target: PreferenceTarget): Promise<string[]>;
}

/**
 * Ergonomic façade over a {@link PreferenceStore}. Accepts a {@link Notifiable} (deriving its
 * reference via the core `notifiableRef`) or a {@link NotifiableRef} directly.
 *
 * ```ts
 * await prefs.mute(user, 'mail');
 * await prefs.forTenant('acme').mute(user, 'sms');
 * ```
 */
@Injectable()
export class NotificationPreferences implements ScopedPreferences {
  constructor(@Inject(NOTIFICATION_PREFERENCE_STORE) private readonly store: PreferenceStore) {}

  mute(target: PreferenceTarget, channel: string): Promise<void> {
    return this.scoped(undefined).mute(target, channel);
  }

  unmute(target: PreferenceTarget, channel: string): Promise<void> {
    return this.scoped(undefined).unmute(target, channel);
  }

  isMuted(target: PreferenceTarget, channel: string): Promise<boolean> {
    return this.scoped(undefined).isMuted(target, channel);
  }

  muted(target: PreferenceTarget): Promise<string[]> {
    return this.scoped(undefined).muted(target);
  }

  /** Return the same operations scoped to a tenant (every key carries `tenant`). */
  forTenant(tenant: string): ScopedPreferences {
    return this.scoped(tenant);
  }

  private scoped(tenant: string | undefined): ScopedPreferences {
    const store = this.store;
    return {
      mute: (target, channel) => store.mute({ tenant, ...resolve(target), channel }),
      unmute: (target, channel) => store.unmute({ tenant, ...resolve(target), channel }),
      isMuted: (target, channel) => store.isMuted({ tenant, ...resolve(target), channel }),
      muted: (target) => store.mutedChannels({ tenant, ...resolve(target) }),
    };
  }
}
