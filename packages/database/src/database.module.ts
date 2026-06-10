import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { DatabaseChannel } from './database.channel';
import { InMemoryStore } from './in-memory.store';
import type { NotificationStore } from './interfaces';
import { NOTIFICATION_STORE } from './tokens';

export interface DatabaseChannelOptions {
  /** A store class to instantiate, or omit to use the in-memory store. */
  store?: Type<NotificationStore>;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
  /** Extra modules to import (e.g. the ORM module providing the store's dependencies). */
  imports?: DynamicModule['imports'];
}

/**
 * Registers the database channel. Pair with an ORM adapter package
 * (`@dudousxd/nestjs-notifications-database-typeorm` or `-mikro-orm`) or pass a custom store.
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
      DatabaseChannel,
    ];
    return {
      module: DatabaseChannelModule,
      global: options.global ?? true,
      imports: options.imports ?? [],
      providers,
      exports: [DatabaseChannel, NOTIFICATION_STORE],
    };
  }

  /** Register with an already-provided store token (e.g. provided by an ORM adapter module). */
  static forFeature(): DynamicModule {
    return {
      module: DatabaseChannelModule,
      providers: [DatabaseChannel],
      exports: [DatabaseChannel],
    };
  }
}
