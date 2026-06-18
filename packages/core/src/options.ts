import type { ModuleMetadata, Provider, Type } from '@nestjs/common';
import type { DispatchGuardOptions } from './dispatch-guards';
import type {
  DispatchDriver,
  ErrorPolicy,
  Notifiable,
  NotifiableRef,
  NotificationClass,
} from './interfaces';
import type { LocaleResolver, TranslationCatalog, Translator } from './localization';

/** i18n / localization configuration for {@link NotificationsModule.forRoot}. All optional. */
export interface LocalizationOptions {
  /** Fallback locale when a notifiable resolves none. Default `'en'`. */
  defaultLocale?: string;
  /** Custom locale resolver; defaults to reading a locale property off the notifiable. */
  resolver?: LocaleResolver;
  /** Custom translator; defaults to an in-memory translator over {@link catalog}. */
  translator?: Translator;
  /** Translation catalog for the default in-memory translator (`{ locale: { key: text } }`). */
  catalog?: TranslationCatalog;
}

/** Static configuration for {@link NotificationsModule.forRoot}. */
export interface NotificationsModuleOptions {
  /**
   * Notification classes that may be dispatched asynchronously. Used to rebuild the
   * right class from its serialized name inside a worker. Not needed for sync-only apps.
   */
  notifications?: NotificationClass[];
  /**
   * Reloads a notifiable from its reference inside an async worker. Required if any
   * notification sets `shouldQueue` and is processed out of process.
   */
  resolveNotifiable?: (ref: NotifiableRef) => Promise<Notifiable> | Notifiable;
  /** What to do when one channel fails. Defaults to `continueOnError`. */
  errorPolicy?: ErrorPolicy;
  /** Register the module globally so the service is injectable everywhere. Default true. */
  global?: boolean;
  /**
   * Override the async dispatch driver (default {@link SyncDispatcher}). Provide the
   * dispatcher class; supply its dependencies through {@link imports}/{@link providers}.
   */
  dispatcher?: Type<DispatchDriver>;
  /** Extra modules to import (e.g. `BullModule.registerQueue(...)` for the BullMQ dispatcher). */
  imports?: ModuleMetadata['imports'];
  /** Extra providers (e.g. the dispatcher's config token). */
  providers?: Provider[];
  /**
   * Dedup (idempotency) and throttle (rate-limit) guards applied in the core dispatch path,
   * covering both sync and async sends. Entirely opt-in — omit it and behavior is unchanged.
   * Notifications opt in per-instance via `idempotencyKey()` / `throttle()`.
   */
  dispatchGuards?: DispatchGuardOptions;
  /**
   * i18n / localization plumbing. Opt-in: omit it and a default locale resolver (reads a locale
   * property) + empty translator are used, so a notification that ignores localization renders
   * exactly as before.
   */
  localization?: LocalizationOptions;
}

/** Async configuration for {@link NotificationsModule.forRootAsync}. */
export interface NotificationsModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: any[]) => Promise<NotificationsModuleOptions> | NotificationsModuleOptions;
  inject?: any[];
  /** Override the async dispatch driver class. */
  dispatcher?: Type<DispatchDriver>;
  /** Extra providers (e.g. a dispatcher and its config) registered alongside the options. */
  providers?: Provider[];
  global?: boolean;
}
