import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import { CategoryRegistry } from './category-registry';
import type {
  CategoryDefinition,
  CategoryPreference,
  DigestFrequency,
  PreferenceCenterStore,
  PreferenceMatrix,
  PreferenceResolution,
  QuietHours,
} from './preference-center.interfaces';
import { evaluateQuietHours } from './quiet-hours';
import { PREFERENCE_CENTER_STORE } from './tokens';

/**
 * Injectable façade over a {@link PreferenceCenterStore} and the {@link CategoryRegistry}. It
 * merges stored preferences with category defaults, exposes the matrix for a UI, and resolves a
 * single (category × channel) decision for the gate.
 */
@Injectable()
export class PreferenceCenterService {
  constructor(
    @Inject(PREFERENCE_CENTER_STORE) private readonly store: PreferenceCenterStore,
    private readonly registry: CategoryRegistry,
  ) {}

  /** The configured category definitions (for the UI). */
  listCategories(): CategoryDefinition[] {
    return this.registry.all();
  }

  /**
   * The resolved matrix for a notifiable: every registered category, each filled in with the
   * notifiable's stored values merged over the category defaults. Mandatory categories are
   * normalized to `instant` digest with their default channels forced on.
   */
  async getMatrix(ref: NotifiableRef, tenantId?: string): Promise<PreferenceMatrix> {
    const stored = await this.store.getMatrix(ref, tenantId);
    const categories: Record<string, CategoryPreference> = {};
    for (const def of this.registry.all()) {
      categories[def.key] = this.merge(def, stored.categories[def.key]);
    }
    // Preserve any stored categories not present in the registry (e.g. legacy keys).
    for (const [key, pref] of Object.entries(stored.categories)) {
      if (!categories[key]) {
        categories[key] = this.merge(this.registry.get(key), pref);
      }
    }
    // Carry the notifiable-level quiet-hours window through (used by the digest collector and any
    // UI). Additive: undefined when none stored, so existing consumers are unaffected.
    return { ref, tenantId, categories, quietHours: stored.quietHours };
  }

  /** Toggle one (category × channel) for a notifiable. */
  async setChannel(
    ref: NotifiableRef,
    category: string,
    channel: string,
    enabled: boolean,
    tenantId?: string,
  ): Promise<void> {
    await this.store.setChannel(ref, category, channel, enabled, tenantId);
  }

  /** Set the digest frequency for a category. */
  async setDigest(
    ref: NotifiableRef,
    category: string,
    digest: DigestFrequency,
    tenantId?: string,
  ): Promise<void> {
    await this.store.setDigest(ref, category, digest, tenantId);
  }

  /** Replace a category's full preference. */
  async setCategory(
    ref: NotifiableRef,
    category: string,
    pref: CategoryPreference,
    tenantId?: string,
  ): Promise<void> {
    await this.store.setCategory(ref, category, pref, tenantId);
  }

  /** Revert a category to the registry defaults. */
  async resetCategory(ref: NotifiableRef, category: string, tenantId?: string): Promise<void> {
    await this.store.resetCategory(ref, category, tenantId);
  }

  /**
   * Set (or clear with `null`) the notifiable-level quiet-hours window. Throws if the bound store
   * predates quiet hours (doesn't implement {@link PreferenceCenterStore.setQuietHours}).
   */
  async setQuietHours(
    ref: NotifiableRef,
    quietHours: QuietHours | null,
    tenantId?: string,
  ): Promise<void> {
    if (typeof this.store.setQuietHours !== 'function') {
      throw new Error(
        'The configured PreferenceCenterStore does not support quiet hours (setQuietHours).',
      );
    }
    await this.store.setQuietHours(ref, quietHours, tenantId);
  }

  /**
   * Resolve whether `channel` may deliver instantly for `category` to this notifiable.
   *
   * - Mandatory categories are always `{ allowed: true, digest: 'instant' }`.
   * - If the channel is disabled (stored, or not in defaults), `allowed` is false.
   * - If the category's digest is not `instant`, instant delivery is suppressed (`allowed`
   *   false). For an enabled channel on `daily`/`weekly` the resolution is marked
   *   {@link PreferenceResolution.digestEligible} so the gate collects it into a periodic digest.
   */
  async resolve(
    ref: NotifiableRef,
    category: string,
    channel: string,
    tenantId?: string,
    now: Date = new Date(),
  ): Promise<PreferenceResolution> {
    const def = this.registry.get(category);
    if (def.mandatory) {
      // Mandatory categories bypass everything, including quiet hours.
      return { allowed: true, digest: 'instant' };
    }

    const stored = await this.store.getMatrix(ref, tenantId);
    const pref = this.merge(def, stored.categories[category]);

    if (pref.digest === 'off') {
      return { allowed: false, digest: 'off' };
    }

    const channelEnabled = pref.channels[channel] ?? false;
    if (!channelEnabled) {
      return { allowed: false, digest: pref.digest };
    }

    // Non-instant digest on an ENABLED channel: suppress instant delivery but mark the channel
    // digest-eligible so the gate collects the notification into a periodic digest (sent later
    // in a batch) rather than dropping it. `off` is handled above (a true drop).
    if (pref.digest !== 'instant') {
      return { allowed: false, digest: pref.digest, digestEligible: true };
    }

    // Quiet hours: when inside the window, defer (re-queue) instead of dropping. A per-category
    // window overrides the notifiable-level one.
    const quiet = pref.quietHours ?? stored.quietHours;
    if (quiet) {
      const evaluation = evaluateQuietHours(quiet, now);
      if (evaluation.active) {
        return { allowed: false, digest: 'instant', deferUntil: evaluation.resumeAt };
      }
    }

    return { allowed: true, digest: 'instant' };
  }

  /** Merge a stored category preference over the registry defaults. */
  private merge(def: CategoryDefinition, stored?: CategoryPreference): CategoryPreference {
    const channels: Record<string, boolean> = {};
    for (const channel of def.defaultChannels ?? []) {
      channels[channel] = true;
    }
    if (stored) {
      Object.assign(channels, stored.channels);
    }

    if (def.mandatory) {
      // Mandatory categories are non-overridable: defaults on, instant cadence.
      for (const channel of def.defaultChannels ?? []) {
        channels[channel] = true;
      }
      return { category: def.key, channels, digest: 'instant' };
    }

    return {
      category: def.key,
      channels,
      digest: stored?.digest ?? 'instant',
      quietHours: stored?.quietHours,
    };
  }
}
