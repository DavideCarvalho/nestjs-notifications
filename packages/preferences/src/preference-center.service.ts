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
} from './preference-center.interfaces';
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
    return { ref, tenantId, categories };
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
   * Resolve whether `channel` may deliver instantly for `category` to this notifiable.
   *
   * - Mandatory categories are always `{ allowed: true, digest: 'instant' }`.
   * - If the channel is disabled (stored, or not in defaults), `allowed` is false.
   * - If the category's digest is not `instant`, instant delivery is suppressed (`allowed`
   *   false) — a scheduled digest job would batch+send these; batching is out of scope here.
   */
  async resolve(
    ref: NotifiableRef,
    category: string,
    channel: string,
    tenantId?: string,
  ): Promise<PreferenceResolution> {
    const def = this.registry.get(category);
    if (def.mandatory) {
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

    // Non-instant digest: suppress instant delivery; the digest job collects+sends later.
    return { allowed: pref.digest === 'instant', digest: pref.digest };
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
    };
  }
}
