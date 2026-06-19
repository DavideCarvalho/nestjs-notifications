export * from './interfaces';
export {
  type ContextAccessor,
  type ContextStore,
  type UserRef,
  captureContext,
} from './context-accessor';
export * from './decorators';
export { BaseChannel, notificationName } from './base-channel';
export { isHttpsUrl, postJson, resolveWebhookUrl, type PostJsonOptions } from './channel-http';
export * from './options';
export * from './tokens';
export * from './events';
export * from './errors';
export { NotificationsModule } from './notifications.module';
export { defineChannelModule, type ChannelModuleConfig } from './define-channel-module';
export {
  NotificationService,
  type ScopedNotifier,
  type SendScope,
  type TenantScopedNotifier,
} from './notification.service';
export { ChannelRegistry } from './channel-registry';
export { ChannelRunner } from './channel-runner';
export {
  type IdempotencyStore,
  type ThrottleStore,
  type IdempotencyAware,
  type ThrottleAware,
  type ThrottleConfig,
  type ThrottleOverflow,
  type DispatchGuardOptions,
  InMemoryIdempotencyStore,
  InMemoryThrottleStore,
  idempotencyStoreKey,
  throttleStoreKey,
} from './dispatch-guards';
export { DispatchGuards, type GuardDecision } from './dispatch-guard.service';
export {
  type LocaleResolver,
  type Translator,
  type TranslateParams,
  type TranslationCatalog,
  type Localization,
  PropertyLocaleResolver,
  InMemoryTranslator,
  makeLocalization,
  baseLocale,
} from './localization';
export { LocalizationService } from './localization.service';
export {
  type FallbackAware,
  type FallbackPolicy,
  type FallbackChainResult,
  type DeliveryConfirmation,
  runFallbackChain,
  readFallback,
  deliveredFromResult,
} from './fallback-chain';
export { NotificationSerializer } from './serializer';
export { SyncDispatcher } from './sync.dispatcher';
export { PendingNotification, AnonymousNotifiable } from './pending-notification';
