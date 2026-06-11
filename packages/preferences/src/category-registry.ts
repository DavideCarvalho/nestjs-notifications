import type { Notification } from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { CategoryDefinition } from './preference-center.interfaces';
import { PREFERENCE_CENTER_CATEGORIES } from './tokens';

/** The category key used when a notification declares none. */
export const DEFAULT_CATEGORY = 'general';

/** A notification that opts into a category via a property or getter. */
interface Categorized {
  category?: string;
}

/**
 * Resolve a notification's category. Reads an explicit `category` property/getter off the
 * notification; falls back to {@link DEFAULT_CATEGORY} when absent.
 *
 * ```ts
 * class InvoicePaid { readonly category = 'billing'; ... }
 * getCategory(new InvoicePaid()); // 'billing'
 * ```
 */
export function getCategory(notification: Notification): string {
  const category = (notification as Categorized).category;
  return typeof category === 'string' && category.length > 0 ? category : DEFAULT_CATEGORY;
}

/**
 * Holds the app's {@link CategoryDefinition}s (provided via module options) and answers lookups.
 * Unknown categories resolve to a synthesized definition so the system never hard-fails on a
 * category the app forgot to register.
 */
@Injectable()
export class CategoryRegistry {
  private readonly byKey = new Map<string, CategoryDefinition>();

  constructor(@Inject(PREFERENCE_CENTER_CATEGORIES) categories: CategoryDefinition[]) {
    for (const category of categories) {
      this.byKey.set(category.key, { allowDigest: true, ...category });
    }
  }

  /** All registered category definitions, in registration order. */
  all(): CategoryDefinition[] {
    return [...this.byKey.values()];
  }

  /** Look up a definition by key, or `undefined` if not registered. */
  find(key: string): CategoryDefinition | undefined {
    return this.byKey.get(key);
  }

  /**
   * Resolve a definition for a key, synthesizing a permissive default for unknown keys so
   * downstream code always has a definition to work with.
   */
  get(key: string): CategoryDefinition {
    return (
      this.byKey.get(key) ?? {
        key,
        label: key,
        defaultChannels: [],
        mandatory: false,
        allowDigest: true,
      }
    );
  }

  /** Resolve the category key for a notification (explicit `category` or the default). */
  resolve(notification: Notification): string {
    return getCategory(notification);
  }
}
