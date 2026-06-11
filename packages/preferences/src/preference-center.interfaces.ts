import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';

/**
 * How often a category's notifications should be delivered on a channel:
 *
 * - `instant` — deliver immediately (the default; the gate lets instant delivery through).
 * - `daily` / `weekly` — batch into a digest; instant delivery is suppressed and a scheduled
 *   digest job would collect+send these (digest batching/sending is out of scope here).
 * - `off` — never deliver for this category (equivalent to disabling every channel).
 */
export type DigestFrequency = 'instant' | 'daily' | 'weekly' | 'off';

/**
 * App-level declaration of a notification category. Provided through the module options and
 * held by the {@link CategoryRegistry}. Categories form the rows of the preference matrix.
 */
export interface CategoryDefinition {
  /** Stable key matched against a notification's `category` (e.g. `billing`, `security`). */
  key: string;
  /** Human-readable label for the preference UI. */
  label: string;
  /** Optional longer description shown alongside the label. */
  description?: string;
  /** Channels enabled by default when a notifiable has no stored preference for this category. */
  defaultChannels?: string[];
  /**
   * Mandatory (non-overridable) categories — e.g. `security`. The gate always allows these
   * regardless of stored preferences, and digest is forced to `instant`.
   */
  mandatory?: boolean;
  /** Whether the UI should expose a digest control for this category. Default true. */
  allowDigest?: boolean;
}

/** A single channel toggle for a category. */
export interface ChannelPreference {
  channel: string;
  enabled: boolean;
}

/**
 * A notifiable's stored preference for one category: the per-channel toggles plus the digest
 * frequency. A missing channel falls back to the category's `defaultChannels`.
 */
export interface CategoryPreference {
  /** The category key these preferences apply to. */
  category: string;
  /** Per-channel enabled flags. Channels absent here use the category defaults. */
  channels: Record<string, boolean>;
  /** Delivery cadence for this category. */
  digest: DigestFrequency;
}

/**
 * The full per-notifiable preference set: every {@link CategoryPreference} keyed by category,
 * plus the scope (notifiable ref + optional tenant) it belongs to.
 */
export interface PreferenceMatrix {
  /** The notifiable this matrix belongs to. */
  ref: NotifiableRef;
  /** Tenant scope; undefined in single-tenant apps. */
  tenantId?: string;
  /** Stored category preferences, keyed by category key. */
  categories: Record<string, CategoryPreference>;
}

/**
 * Persistence for the preference center. Stores the per-(category × channel) toggles and the
 * per-category digest frequency for each notifiable (and tenant). Implement against your
 * datastore, or use the bundled {@link InMemoryPreferenceCenterStore}.
 *
 * `ref` is a {@link NotifiableRef} (`{ type, id }`).
 */
export interface PreferenceCenterStore {
  /** Return the stored matrix for a notifiable (and tenant). Only explicitly-set values. */
  getMatrix(ref: NotifiableRef, tenantId?: string): Promise<PreferenceMatrix>;
  /** Toggle a single (category × channel). */
  setChannel(
    ref: NotifiableRef,
    category: string,
    channel: string,
    enabled: boolean,
    tenantId?: string,
  ): Promise<void>;
  /** Set the digest frequency for a category. */
  setDigest(
    ref: NotifiableRef,
    category: string,
    digest: DigestFrequency,
    tenantId?: string,
  ): Promise<void>;
  /** Replace a category's full preference in one call. */
  setCategory(
    ref: NotifiableRef,
    category: string,
    pref: CategoryPreference,
    tenantId?: string,
  ): Promise<void>;
  /** Drop a category's stored preference, reverting it to the registry defaults. */
  resetCategory(ref: NotifiableRef, category: string, tenantId?: string): Promise<void>;
}

/** Outcome of resolving a (category × channel) preference for delivery. */
export interface PreferenceResolution {
  /** Whether the channel may deliver instantly for this category right now. */
  allowed: boolean;
  /** The effective digest frequency for this category. */
  digest: DigestFrequency;
}
