import { NOTIFICATION_PREFERENCE_GATE } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { CategoryRegistry } from './category-registry';
import { InMemoryPreferenceCenterStore } from './in-memory.preference-center.store';
import { InMemoryPreferenceStore } from './in-memory.store';
import type { PreferenceStore } from './interfaces';
import { NotificationPreferences } from './notification-preferences';
import { PreferenceCenterGate } from './preference-center.gate';
import type { CategoryDefinition, PreferenceCenterStore } from './preference-center.interfaces';
import { PreferenceCenterService } from './preference-center.service';
import { PreferenceGateAdapter } from './preference-gate.adapter';
import {
  NOTIFICATION_PREFERENCE_STORE,
  PREFERENCE_CENTER_CATEGORIES,
  PREFERENCE_CENTER_STORE,
} from './tokens';

/** Options for {@link PreferencesModule.forRoot}. */
export interface PreferencesModuleOptions {
  /** A {@link PreferenceStore} class to instantiate; defaults to {@link InMemoryPreferenceStore}. */
  store?: Type<PreferenceStore>;
  /** Register globally so the preferences service and gate are available app-wide. Default true. */
  global?: boolean;
}

/** Options for {@link PreferencesModule.forCenter}. */
export interface PreferenceCenterModuleOptions {
  /** The app's category definitions (the rows of the preference matrix). */
  categories: CategoryDefinition[];
  /**
   * A {@link PreferenceCenterStore} class to instantiate; defaults to
   * {@link InMemoryPreferenceCenterStore}.
   */
  store?: Type<PreferenceCenterStore>;
  /** Register globally so the service and gate are available app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers channel preferences. Binds the core `NOTIFICATION_PREFERENCE_GATE` token to a
 * store-backed gate so the ChannelRunner automatically skips muted channels.
 *
 * ```ts
 * PreferencesModule.forRoot()                          // in-memory store (simple opt-out)
 * PreferencesModule.forRoot({ store: PrismaPrefStore }) // your store
 * PreferencesModule.forCenter({ categories })          // full preference center
 * ```
 */
@Module({})
export class PreferencesModule {
  /** Simple per-channel opt-out muting (unchanged). */
  static forRoot(options: PreferencesModuleOptions = {}): DynamicModule {
    const storeClass = options.store ?? InMemoryPreferenceStore;
    const providers: Provider[] = [
      storeClass,
      { provide: NOTIFICATION_PREFERENCE_STORE, useExisting: storeClass },
      NotificationPreferences,
      PreferenceGateAdapter,
      { provide: NOTIFICATION_PREFERENCE_GATE, useExisting: PreferenceGateAdapter },
    ];
    return {
      module: PreferencesModule,
      global: options.global ?? true,
      providers,
      exports: [NotificationPreferences, NOTIFICATION_PREFERENCE_STORE],
    };
  }

  /**
   * Full preference center: per-(category × channel) toggles + per-category digest frequency.
   * Wires the {@link CategoryRegistry}, the {@link PreferenceCenterStore}, the
   * {@link PreferenceCenterService}, and binds {@link PreferenceCenterGate} to the core
   * `NOTIFICATION_PREFERENCE_GATE` token (so it replaces the simple opt-out gate).
   */
  static forCenter(options: PreferenceCenterModuleOptions): DynamicModule {
    const storeClass = options.store ?? InMemoryPreferenceCenterStore;
    const providers: Provider[] = [
      { provide: PREFERENCE_CENTER_CATEGORIES, useValue: options.categories },
      CategoryRegistry,
      storeClass,
      { provide: PREFERENCE_CENTER_STORE, useExisting: storeClass },
      PreferenceCenterService,
      PreferenceCenterGate,
      { provide: NOTIFICATION_PREFERENCE_GATE, useExisting: PreferenceCenterGate },
    ];
    return {
      module: PreferencesModule,
      global: options.global ?? true,
      providers,
      exports: [
        PreferenceCenterService,
        CategoryRegistry,
        PREFERENCE_CENTER_STORE,
        PREFERENCE_CENTER_CATEGORIES,
      ],
    };
  }
}
