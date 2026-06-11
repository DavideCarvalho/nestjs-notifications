/** DI token for the {@link PreferenceStore} implementation backing the preferences package. */
export const NOTIFICATION_PREFERENCE_STORE = Symbol('NOTIFICATION_PREFERENCE_STORE');

/** DI token for the {@link PreferenceCenterStore} implementation backing the preference center. */
export const PREFERENCE_CENTER_STORE = Symbol('PREFERENCE_CENTER_STORE');

/** DI token for the array of {@link CategoryDefinition}s configured for the preference center. */
export const PREFERENCE_CENTER_CATEGORIES = Symbol('PREFERENCE_CENTER_CATEGORIES');
