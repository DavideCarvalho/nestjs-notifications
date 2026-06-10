import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { DatabaseChannel } from './database.channel';
import { InMemoryStore } from './in-memory.store';
import type { NotificationStore } from './interfaces';
import { NotificationsQueryService } from './notifications-query.service';
import { SchemaInitializer } from './schema-initializer';
import { AUTO_CREATE_SCHEMA, NOTIFICATION_STORE } from './tokens';

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
}

export interface DatabaseChannelFeatureOptions {
  /** See {@link DatabaseChannelOptions.autoCreateSchema}. Default true. */
  autoCreateSchema?: boolean;
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
      DatabaseChannel,
      NotificationsQueryService,
      SchemaInitializer,
    ];
    return {
      module: DatabaseChannelModule,
      global: options.global ?? true,
      imports: options.imports ?? [],
      providers,
      exports: [DatabaseChannel, NOTIFICATION_STORE, NotificationsQueryService],
    };
  }

  /** Register with an already-provided store token (e.g. provided by an ORM adapter module). */
  static forFeature(options: DatabaseChannelFeatureOptions = {}): DynamicModule {
    return {
      module: DatabaseChannelModule,
      providers: [
        { provide: AUTO_CREATE_SCHEMA, useValue: options.autoCreateSchema ?? true },
        DatabaseChannel,
        NotificationsQueryService,
        SchemaInitializer,
      ],
      exports: [DatabaseChannel, NotificationsQueryService],
    };
  }
}
