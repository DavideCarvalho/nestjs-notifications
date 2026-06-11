import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { Injectable } from '@nestjs/common';
import type {
  CategoryPreference,
  DigestFrequency,
  PreferenceCenterStore,
  PreferenceMatrix,
} from './preference-center.interfaces';

/** Build a stable key for a (tenant, notifiable) scope. */
function scopeKey(ref: NotifiableRef, tenantId?: string): string {
  return JSON.stringify([tenantId ?? null, ref.type, String(ref.id)]);
}

/**
 * In-memory {@link PreferenceCenterStore} for tests and prototyping. Holds each notifiable's
 * stored category preferences. Not for production — state is lost on restart.
 */
@Injectable()
export class InMemoryPreferenceCenterStore implements PreferenceCenterStore {
  /** scopeKey -> (category -> CategoryPreference). */
  private readonly matrices = new Map<string, Map<string, CategoryPreference>>();

  async getMatrix(ref: NotifiableRef, tenantId?: string): Promise<PreferenceMatrix> {
    const stored = this.matrices.get(scopeKey(ref, tenantId));
    const categories: Record<string, CategoryPreference> = {};
    if (stored) {
      for (const [key, pref] of stored) {
        categories[key] = { ...pref, channels: { ...pref.channels } };
      }
    }
    return { ref, tenantId, categories };
  }

  async setChannel(
    ref: NotifiableRef,
    category: string,
    channel: string,
    enabled: boolean,
    tenantId?: string,
  ): Promise<void> {
    const pref = this.ensure(ref, category, tenantId);
    pref.channels[channel] = enabled;
  }

  async setDigest(
    ref: NotifiableRef,
    category: string,
    digest: DigestFrequency,
    tenantId?: string,
  ): Promise<void> {
    const pref = this.ensure(ref, category, tenantId);
    pref.digest = digest;
  }

  async setCategory(
    ref: NotifiableRef,
    category: string,
    pref: CategoryPreference,
    tenantId?: string,
  ): Promise<void> {
    this.bucket(ref, tenantId).set(category, {
      category,
      digest: pref.digest,
      channels: { ...pref.channels },
    });
  }

  async resetCategory(ref: NotifiableRef, category: string, tenantId?: string): Promise<void> {
    this.matrices.get(scopeKey(ref, tenantId))?.delete(category);
  }

  /** Get (or create) the per-scope category map. */
  private bucket(ref: NotifiableRef, tenantId?: string): Map<string, CategoryPreference> {
    const key = scopeKey(ref, tenantId);
    let bucket = this.matrices.get(key);
    if (!bucket) {
      bucket = new Map();
      this.matrices.set(key, bucket);
    }
    return bucket;
  }

  /** Get (or create) a category preference within a scope. */
  private ensure(ref: NotifiableRef, category: string, tenantId?: string): CategoryPreference {
    const bucket = this.bucket(ref, tenantId);
    let pref = bucket.get(category);
    if (!pref) {
      pref = { category, channels: {}, digest: 'instant' };
      bucket.set(category, pref);
    }
    return pref;
  }
}
