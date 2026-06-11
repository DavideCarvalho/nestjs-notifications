import { NOTIFICATION_PREFERENCE_GATE } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { InMemoryPreferenceStore } from './in-memory.store';
import type { PreferenceStore } from './interfaces';
import { NotificationPreferences } from './notification-preferences';
import { PreferenceGateAdapter } from './preference-gate.adapter';
import { NOTIFICATION_PREFERENCE_STORE } from './tokens';

/** Options for {@link PreferencesModule.forRoot}. */
export interface PreferencesModuleOptions {
  /** A {@link PreferenceStore} class to instantiate; defaults to {@link InMemoryPreferenceStore}. */
  store?: Type<PreferenceStore>;
  /** Register globally so the preferences service and gate are available app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers channel preferences. Binds the core `NOTIFICATION_PREFERENCE_GATE` token to a
 * store-backed gate so the ChannelRunner automatically skips muted channels.
 *
 * ```ts
 * PreferencesModule.forRoot()                          // in-memory store
 * PreferencesModule.forRoot({ store: PrismaPrefStore }) // your store
 * ```
 */
@Module({})
export class PreferencesModule {
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
}
