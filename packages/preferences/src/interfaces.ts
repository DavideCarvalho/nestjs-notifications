/**
 * A fully-qualified preference entry: which channel is muted for which notifiable, optionally
 * scoped to a tenant. Used by the {@link PreferenceStore}.
 */
export interface PreferenceKey {
  /** Tenant scope; undefined in single-tenant apps. */
  tenant?: string;
  /** The notifiable's morph type (e.g. the class name or `@Notifiable({ type })`). */
  notifiableType: string;
  /** The notifiable's id, stringified. */
  notifiableId: string;
  /** The channel name (e.g. `mail`, `sms`). */
  channel: string;
}

/** A notifiable+tenant scope without a specific channel — used to list muted channels. */
export interface PreferenceScope {
  tenant?: string;
  notifiableType: string;
  notifiableId: string;
}

/**
 * Persistence for channel preferences. Models an **opt-out** policy: a channel is allowed
 * unless it has been explicitly muted. Implement this against your datastore, or use the
 * bundled {@link InMemoryPreferenceStore}.
 */
export interface PreferenceStore {
  /** Whether `key.channel` is currently muted for the given notifiable (and tenant). */
  isMuted(key: PreferenceKey): Promise<boolean>;
  /** Mute a channel for a notifiable (and tenant). Idempotent. */
  mute(key: PreferenceKey): Promise<void>;
  /** Un-mute a previously muted channel. Idempotent. */
  unmute(key: PreferenceKey): Promise<void>;
  /** List all channels currently muted for the notifiable within the scope. */
  mutedChannels(scope: PreferenceScope): Promise<string[]>;
}
