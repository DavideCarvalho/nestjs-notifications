/** DI token for the {@link PreferenceStore} implementation backing the preferences package. */
export const NOTIFICATION_PREFERENCE_STORE = Symbol('NOTIFICATION_PREFERENCE_STORE');

/** DI token for the {@link PreferenceCenterStore} implementation backing the preference center. */
export const PREFERENCE_CENTER_STORE = Symbol('PREFERENCE_CENTER_STORE');

/** DI token for the array of {@link CategoryDefinition}s configured for the preference center. */
export const PREFERENCE_CENTER_CATEGORIES = Symbol('PREFERENCE_CENTER_CATEGORIES');

/**
 * DI token for the {@link PendingDigestStore} backing collected-but-not-yet-sent digest entries.
 *
 * `Symbol.for` (global registry), not a unique `Symbol`: the database adapter packages bind this
 * token while keeping this package an OPTIONAL peer — they inline `Symbol.for` with the same key
 * instead of importing this constant, so requiring an adapter never requires this package at
 * runtime. A unique Symbol would force that runtime edge (the exact crash: a consumer without
 * digests removes the preferences dep and the adapter's `require` chain fails at boot).
 */
export const PENDING_DIGEST_STORE = Symbol.for('nestjs-notifications:pending-digest-store');

/** DI token for the {@link DigestOptions} configuring the digest collector. */
export const DIGEST_OPTIONS = Symbol('DIGEST_OPTIONS');
