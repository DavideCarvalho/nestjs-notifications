export type { PreferenceKey, PreferenceScope, PreferenceStore } from './interfaces';
export { NOTIFICATION_PREFERENCE_STORE } from './tokens';
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
} from './preferences.module';
