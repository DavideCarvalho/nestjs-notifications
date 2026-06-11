/** DI token for the {@link PushTransport} implementation that delivers push notifications. */
export const PUSH_TRANSPORT = Symbol('PUSH_TRANSPORT');

/** DI token for the VAPID options handed to the {@link WebPushTransport}. */
export const WEB_PUSH_OPTIONS = Symbol('WEB_PUSH_OPTIONS');

/** DI token for the app/service-account options handed to the {@link FcmTransport}. */
export const FCM_OPTIONS = Symbol('FCM_OPTIONS');

/** DI token for the options handed to the {@link ExpoTransport}. */
export const EXPO_OPTIONS = Symbol('EXPO_OPTIONS');

/** DI token for the options handed to the {@link ApnsTransport}. */
export const APNS_OPTIONS = Symbol('APNS_OPTIONS');

/** DI token for the optional per-tenant {@link PushTransport} resolver. */
export const PUSH_TRANSPORT_RESOLVER = Symbol('PUSH_TRANSPORT_RESOLVER');
