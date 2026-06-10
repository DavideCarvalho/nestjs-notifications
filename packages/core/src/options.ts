import type { ModuleMetadata, Provider, Type } from '@nestjs/common';
import type {
  DispatchDriver,
  ErrorPolicy,
  Notifiable,
  NotifiableRef,
  NotificationClass,
} from './interfaces';

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
