export type { PreferenceKey, PreferenceScope, PreferenceStore } from './interfaces';
export {
  NOTIFICATION_PREFERENCE_STORE,
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
} from './preferences.module';

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
export { InMemoryPreferenceCenterStore } from './in-memory.preference-center.store';
export { PreferenceCenterService } from './preference-center.service';
export { PreferenceCenterGate } from './preference-center.gate';
export {
  createPreferenceCenterController,
  type PreferenceCenterControllerOptions,
} from './preference-center.controller';
