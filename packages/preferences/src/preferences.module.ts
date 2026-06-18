import {
  NOTIFICATION_DIGEST_SINK,
  NOTIFICATION_PREFERENCE_GATE,
} from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { CategoryRegistry } from './category-registry';
import { DigestCollector, type DigestOptions } from './digest-collector';
import { DigestScheduler } from './digest-scheduler';
import { DigestSinkAdapter } from './digest-sink.adapter';
import type { PendingDigestStore } from './digest.interfaces';
import { InMemoryPendingDigestStore } from './in-memory.pending-digest.store';
import { InMemoryPreferenceCenterStore } from './in-memory.preference-center.store';
import { InMemoryPreferenceStore } from './in-memory.store';
import type { PreferenceStore } from './interfaces';
import { NotificationPreferences } from './notification-preferences';
import { PreferenceCenterGate } from './preference-center.gate';
import type { CategoryDefinition, PreferenceCenterStore } from './preference-center.interfaces';
import { PreferenceCenterService } from './preference-center.service';
import { PreferenceGateAdapter } from './preference-gate.adapter';
import {
  DIGEST_OPTIONS,
  NOTIFICATION_PREFERENCE_STORE,
  PENDING_DIGEST_STORE,
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

/** Options for {@link PreferencesModule.forDigest}. */
export interface DigestModuleOptions extends DigestOptions {
  /**
   * A {@link PendingDigestStore} class to instantiate; defaults to
   * {@link InMemoryPendingDigestStore}. Use a persistent adapter (e.g. the TypeORM one) in prod.
   */
  store?: Type<PendingDigestStore>;
  /** Register globally so the collector is injectable app-wide. Default true. */
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

  /**
   * REAL digest collection + flush. Layer this ON TOP of {@link forCenter} (it reuses the gate,
   * the category registry and the preference service). It:
   *
   * - binds a {@link PendingDigestStore} (in-memory by default; pass a persistent adapter),
   * - binds the core `NOTIFICATION_DIGEST_SINK` so the gate's non-instant `skip` decisions are
   *   COLLECTED (not dropped),
   * - provides the {@link DigestCollector} (`flushDigests(cadence, now?)`), and
   * - provides an optional {@link DigestScheduler} that wires `@nestjs/schedule` cron jobs when
   *   the package is present and `dailyCron`/`weeklyCron` are configured.
   *
   * Entirely opt-in: an app that never calls `forDigest` behaves exactly as before (non-instant
   * cadences still suppress instant delivery — but now nothing is silently lost once it's wired).
   *
   * ```ts
   * PreferencesModule.forCenter({ categories }),
   * PreferencesModule.forDigest({ store: TypeOrmPendingDigestStore, dailyCron: '0 9 * * *' }),
   * ```
   */
  static forDigest(options: DigestModuleOptions = {}): DynamicModule {
    const storeClass = options.store ?? InMemoryPendingDigestStore;
    const { store: _store, global: _global, ...digestOptions } = options;
    const providers: Provider[] = [
      storeClass,
      { provide: PENDING_DIGEST_STORE, useExisting: storeClass },
      { provide: DIGEST_OPTIONS, useValue: digestOptions },
      DigestSinkAdapter,
      { provide: NOTIFICATION_DIGEST_SINK, useExisting: DigestSinkAdapter },
      DigestCollector,
      DigestScheduler,
    ];
    return {
      module: PreferencesModule,
      global: options.global ?? true,
      providers,
      exports: [DigestCollector, PENDING_DIGEST_STORE],
    };
  }
}
