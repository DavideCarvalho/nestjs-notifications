export type { PreferenceKey, PreferenceScope, PreferenceStore } from './interfaces';
export {
  DIGEST_OPTIONS,
  NOTIFICATION_PREFERENCE_STORE,
  PENDING_DIGEST_STORE,
  PREFERENCE_CENTER_CATEGORIES,
  PREFERENCE_CENTER_STORE,
} from './tokens';
export { InMemoryPreferenceStore } from './in-memory.store';
export {
  NotificationPreferences,
  type PreferenceTarget,
  type ScopedPreferences,
} from './notification-preferences';
export { PreferenceGateAdapter } from './preference-gate.adapter';
export {
  PreferencesModule,
  type PreferencesModuleOptions,
  type PreferenceCenterModuleOptions,
  type DigestModuleOptions,
} from './preferences.module';

// --- Digests ---
export type {
  DigestCadence,
  NewPendingDigestEntry,
  PendingDigestEntry,
  PendingDigestGroup,
  PendingDigestStore,
} from './digest.interfaces';
export { InMemoryPendingDigestStore } from './in-memory.pending-digest.store';
export {
  DigestCollector,
  type DigestOptions,
  type DigestFlushResult,
} from './digest-collector';
export { DigestScheduler } from './digest-scheduler';
export { DigestSinkAdapter } from './digest-sink.adapter';
export {
  DefaultDigestNotification,
  type DigestContext,
  type DigestItem,
  type DigestNotificationFactory,
} from './digest-notification';

// --- Preference center ---
export type {
  CategoryDefinition,
  CategoryPreference,
  ChannelPreference,
  DigestFrequency,
  PreferenceCenterStore,
  PreferenceMatrix,
  PreferenceResolution,
} from './preference-center.interfaces';
export {
  CategoryRegistry,
  DEFAULT_CATEGORY,
  getCategory,
} from './category-registry';
export {
  type QuietHours,
  type QuietHoursEvaluation,
  evaluateQuietHours,
} from './quiet-hours';
export { InMemoryPreferenceCenterStore } from './in-memory.preference-center.store';
export { PreferenceCenterService } from './preference-center.service';
export { PreferenceCenterGate } from './preference-center.gate';
export {
  createPreferenceCenterController,
  type PreferenceCenterControllerOptions,
} from './preference-center.controller';
