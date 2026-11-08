import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import {
  type DynamicModule,
  Module,
  type Provider,
  type Type,
  UnauthorizedException,
} from '@nestjs/common';
import { rejectRemovedGuards } from './controller-decorators';
import { DatabaseChannel } from './database.channel';
import { InMemoryStore } from './in-memory.store';
import { InboxMountAudit } from './inbox-mount-audit';
import type { NotificationStore } from './interfaces';
import { NotificationPruner, type PruneOptions } from './notification-pruner';
import { NotificationsQueryService } from './notifications-query.service';
import { buildNotificationsController } from './notifications.controller';
import { SchemaInitializer } from './schema-initializer';
import { AUTO_CREATE_SCHEMA, NOTIFICATION_STORE, PRUNE_OPTIONS } from './tokens';

/** Resolves the current notifiable from the request for the auto-mounted inbox controller. */
type ResolveRef = (req: any) => NotifiableRef | Promise<NotifiableRef>;

/** Config for the auto-mounted inbox REST controller. */
export interface InboxControllerOptions {
  /** How to resolve the current notifiable from the request. Default `{ type: 'User', id: req.user?.id }`. */
  resolveRef?: ResolveRef;
  /**
   * Base path to mount the inbox at. Default `'notifications'`. Set this to avoid colliding with a
   * `/notifications` page route under a shared global prefix (keep the client/codegen `path` in sync).
   */
  path?: string;
}

/**
 * Default ref resolver — reads `req.user.id` and assumes a `User` notifiable type. A request with
 * no `req.user.id` (nothing authenticated it) answers `401`: there is no inbox to show, and
 * resolving it to a shared `"undefined"` recipient would be one inbox for every anonymous caller.
 */
const defaultResolveRef: ResolveRef = (req) => {
  const id = req?.user?.id;
  if (id === undefined || id === null || id === '') {
    throw new UnauthorizedException('No authenticated user to resolve the inbox for');
  }
  return { type: 'User', id: String(id) };
};

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
   * Mount the inbox REST controller (`GET/POST/DELETE /notifications`). **Default true.**
   *
   * **Pass `false` if you mount the controller yourself** with
   * {@link createNotificationsController}. Building your own does not replace this one — the
   * default is `true`, so you end up with both, and the auto-mounted one lands on `notifications`
   * with this module's `resolveRef`. That duplicate will shadow an unrelated route your app serves
   * at the same path. Nest logs a warning at bootstrap when it detects both.
   */
  routes?: boolean;
  /**
   * Configure the auto-mounted inbox controller: how the current notifiable is resolved from the
   * request (default `{ type: 'User', id: req.user.id }`, `401` when there is no `req.user.id`)
   * and its base path. Ignored under `routes: false`.
   */
  controller?: InboxControllerOptions;
  /**
   * Class decorators applied, in order, to every controller this module mounts (the inbox), e.g.
   * `[UseGuards(AuthenticationGuard), Can(InboxPolicy, 'read')]` with `@nestjs/authorization`.
   * This is how you decide who reaches the auto-mounted inbox; the other way is `routes: false`
   * and mounting {@link createNotificationsController} in your own module. Mounted controllers are
   * marked open to `@nestjs/authorization`'s deny-by-default guard (`Can.Anyone()`), so they
   * answer without any; a `@Can()` passed here is still enforced.
   */
  decorators?: ClassDecorator[];
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
  /** See {@link DatabaseChannelOptions.routes}. Default true. */
  routes?: boolean;
  /** See {@link DatabaseChannelOptions.controller}. */
  controller?: InboxControllerOptions;
  /** See {@link DatabaseChannelOptions.decorators}. */
  decorators?: ClassDecorator[];
  /** See {@link DatabaseChannelOptions.prune}. */
  prune?: PruneOptions;
}

/**
 * Build the controllers array for the inbox endpoints based on the `routes` option.
 *
 * Note `undefined` mounts — `routes` defaults to true, so this also runs for apps that never
 * mention it and for apps that mount their own controller believing that replaces the default.
 * {@link InboxMountAudit} warns about the latter at bootstrap.
 */
function inboxControllers(options: {
  routes?: boolean;
  controller?: InboxControllerOptions;
  decorators?: ClassDecorator[];
}): Type<unknown>[] {
  const opts = options.controller as unknown;
  if (typeof opts === 'boolean') {
    // `controller: false` used to disable the inbox. Ignoring it would mount the inbox with the
    // defaults for a JS caller who asked for none, so refuse it and point at the replacement.
    throw new Error(
      `DatabaseChannelModule: \`controller: ${opts}\` is no longer supported. Use \`routes: false\` to not mount the inbox (or omit it to mount it), and \`controller: { resolveRef, path }\` to configure it.`,
    );
  }
  rejectRemovedGuards(opts, 'DatabaseChannelModule `controller`');
  if (options.routes === false) return [];
  const resolveRef = options.controller?.resolveRef ?? defaultResolveRef;
  return [
    buildNotificationsController(
      { resolveRef, path: options.controller?.path, decorators: options.decorators },
      // Tagged 'auto' so the bootstrap audit can tell this apart from the app's own mount.
      'auto',
    ),
  ];
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
      InboxMountAudit,
    ];
    return {
      module: DatabaseChannelModule,
      global: options.global ?? true,
      imports: options.imports ?? [],
      controllers: inboxControllers(options),
      providers,
      exports: [DatabaseChannel, NOTIFICATION_STORE, NotificationsQueryService],
    };
  }

  /** Register with an already-provided store token (e.g. provided by an ORM adapter module). */
  static forFeature(options: DatabaseChannelFeatureOptions = {}): DynamicModule {
    return {
      module: DatabaseChannelModule,
      controllers: inboxControllers(options),
      providers: [
        { provide: AUTO_CREATE_SCHEMA, useValue: options.autoCreateSchema ?? true },
        { provide: PRUNE_OPTIONS, useValue: options.prune ?? null },
        DatabaseChannel,
        NotificationsQueryService,
        SchemaInitializer,
        NotificationPruner,
        InboxMountAudit,
      ],
      exports: [DatabaseChannel, NotificationsQueryService],
    };
  }
}
