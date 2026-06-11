import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { DatabaseChannel } from './database.channel';
import { InMemoryStore } from './in-memory.store';
import type { NotificationStore } from './interfaces';
import { NotificationPruner, type PruneOptions } from './notification-pruner';
import { NotificationsQueryService } from './notifications-query.service';
import { createNotificationsController } from './notifications.controller';
import { SchemaInitializer } from './schema-initializer';
import { AUTO_CREATE_SCHEMA, NOTIFICATION_STORE, PRUNE_OPTIONS } from './tokens';

/** Resolves the current notifiable from the request for the auto-mounted inbox controller. */
type ResolveRef = (req: any) => NotifiableRef | Promise<NotifiableRef>;

/** Config for the auto-mounted inbox REST controller. */
export interface InboxControllerOptions {
  /** How to resolve the current notifiable from the request. Default `{ type: 'User', id: req.user?.id }`. */
  resolveRef?: ResolveRef;
}

/** Default ref resolver — reads `req.user.id` and assumes a `User` notifiable type. */
const defaultResolveRef: ResolveRef = (req) => ({ type: 'User', id: String(req?.user?.id) });

export interface DatabaseChannelOptions {
  /** A store class to instantiate, or omit to use the in-memory store. */
  store?: Type<NotificationStore>;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
  /** Extra modules to import (e.g. the ORM module providing the store's dependencies). */
  imports?: DynamicModule['imports'];
  /**
   * Create the backing schema on bootstrap if it's missing (non-destructive). Default true —
   * set to false to manage the schema through your ORM's migrations instead.
   */
  autoCreateSchema?: boolean;
  /**
   * Auto-mount the inbox REST controller (`GET/POST/DELETE /notifications`). **Default true.**
   * Pass `false` to mount it yourself with {@link createNotificationsController}, or an object to
   * customize how the current notifiable is resolved from the request (defaults to
   * `{ type: 'User', id: req.user?.id }`).
   */
  controller?: boolean | InboxControllerOptions;
  /**
   * Schedule periodic deletion of old notifications. Omit to disable. See {@link PruneOptions}.
   *
   * ```ts
   * DatabaseChannelModule.forRoot({ prune: { olderThan: 90 * 24 * 60 * 60 * 1000, onlyRead: true } })
   * ```
   */
  prune?: PruneOptions;
}

export interface DatabaseChannelFeatureOptions {
  /** See {@link DatabaseChannelOptions.autoCreateSchema}. Default true. */
  autoCreateSchema?: boolean;
  /** See {@link DatabaseChannelOptions.controller}. Default true. */
  controller?: boolean | InboxControllerOptions;
  /** See {@link DatabaseChannelOptions.prune}. */
  prune?: PruneOptions;
}

/** Build the controllers array for the inbox endpoints based on the `controller` option. */
function inboxControllers(option: boolean | InboxControllerOptions | undefined): Type<unknown>[] {
  if (option === false) return [];
  const resolveRef =
    (option && option !== true ? option.resolveRef : undefined) ?? defaultResolveRef;
  return [createNotificationsController({ resolveRef })];
}

/**
 * Registers the database channel. Pair with an ORM adapter package
 * (`@dudousxd/nestjs-notifications-database-typeorm`, `-mikro-orm`, `-prisma`) or pass a store.
 *
 * ```ts
 * DatabaseChannelModule.forRoot({ store: TypeOrmNotificationStore, imports: [TypeOrmModule.forFeature([...])] })
 * ```
 */
@Module({})
export class DatabaseChannelModule {
  static forRoot(options: DatabaseChannelOptions = {}): DynamicModule {
    const storeClass = options.store ?? InMemoryStore;
    const providers: Provider[] = [
      storeClass,
      { provide: NOTIFICATION_STORE, useExisting: storeClass },
      { provide: AUTO_CREATE_SCHEMA, useValue: options.autoCreateSchema ?? true },
      { provide: PRUNE_OPTIONS, useValue: options.prune ?? null },
      DatabaseChannel,
      NotificationsQueryService,
      SchemaInitializer,
      NotificationPruner,
    ];
    return {
      module: DatabaseChannelModule,
      global: options.global ?? true,
      imports: options.imports ?? [],
      controllers: inboxControllers(options.controller),
      providers,
      exports: [DatabaseChannel, NOTIFICATION_STORE, NotificationsQueryService],
    };
  }

  /** Register with an already-provided store token (e.g. provided by an ORM adapter module). */
  static forFeature(options: DatabaseChannelFeatureOptions = {}): DynamicModule {
    return {
      module: DatabaseChannelModule,
      controllers: inboxControllers(options.controller),
      providers: [
        { provide: AUTO_CREATE_SCHEMA, useValue: options.autoCreateSchema ?? true },
        { provide: PRUNE_OPTIONS, useValue: options.prune ?? null },
        DatabaseChannel,
        NotificationsQueryService,
        SchemaInitializer,
        NotificationPruner,
      ],
      exports: [DatabaseChannel, NotificationsQueryService],
    };
  }
}
