import type {
  DynamicModule,
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
  Provider,
} from '@nestjs/common';
import type { NotificationTables } from './schema';
import {
  DRIZZLE_NOTIFICATIONS_DB,
  DRIZZLE_NOTIFICATION_TABLES,
  type DrizzlePgDatabase,
} from './tokens';

interface TablesOption {
  /**
   * The tables to query — the SAME object you spread into your drizzle-kit schema (built with
   * `createNotificationTables`). Defaults to the canonical names in the default schema.
   */
  tables?: NotificationTables;
}

/** A database the app passes itself. */
export interface DrizzleStoreDbOptions extends TablesOption {
  /** The app-owned Drizzle Postgres database. */
  db: DrizzlePgDatabase;
  connectionName?: never;
}

/** A database registered with `@nestjs/drizzle`'s `DrizzleModule`, by connection name. */
export interface DrizzleStoreConnectionOptions extends TablesOption {
  /**
   * The `DrizzleModule` connection to use (`'default'` for the unnamed one): the stores inject
   * `getDrizzleToken(connectionName)` from `@nestjs/drizzle` (https://docs.nestjs.com/recipes/drizzle).
   */
  connectionName: string;
  db?: never;
}

/** Options for the Drizzle store modules' `forRoot`. */
export type DrizzleStoreModuleOptions = DrizzleStoreDbOptions | DrizzleStoreConnectionOptions;

/** Options for the Drizzle store modules' `forRootAsync`. */
export interface DrizzleStoreModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  useFactory: (...args: never[]) => DrizzleStoreDbOptions | Promise<DrizzleStoreDbOptions>;
}

/**
 * `@nestjs/drizzle`'s `getDrizzleToken(name)`, inlined: `@nestjs/drizzle` is an OPTIONAL peer
 * (a value import would crash `require` for apps without it). A drift test pins it to the real one.
 */
export function drizzleConnectionToken(name = 'default'): string {
  return name === 'default' ? 'DrizzleDatabase' : `${name}DrizzleDatabase`;
}

const OPTIONS = Symbol('nestjs-notifications:drizzle-store-options');

/** Providers binding the db + tables tokens from static options. */
export function staticProviders(options: DrizzleStoreModuleOptions): Provider[] {
  return [
    options.connectionName !== undefined
      ? {
          provide: DRIZZLE_NOTIFICATIONS_DB,
          useExisting: drizzleConnectionToken(options.connectionName),
        }
      : { provide: DRIZZLE_NOTIFICATIONS_DB, useValue: options.db },
    { provide: DRIZZLE_NOTIFICATION_TABLES, useValue: options.tables ?? null },
  ];
}

/** Providers binding the db + tables tokens from an async factory. */
export function asyncProviders(options: DrizzleStoreModuleAsyncOptions): {
  imports: NonNullable<DynamicModule['imports']>;
  providers: Provider[];
} {
  return {
    imports: options.imports ?? [],
    providers: [
      {
        provide: OPTIONS,
        useFactory: options.useFactory as (...args: unknown[]) => unknown,
        inject: options.inject ?? [],
      },
      {
        provide: DRIZZLE_NOTIFICATIONS_DB,
        useFactory: (o: DrizzleStoreDbOptions) => o.db,
        inject: [OPTIONS],
      },
      {
        provide: DRIZZLE_NOTIFICATION_TABLES,
        useFactory: (o: DrizzleStoreDbOptions) => o.tables ?? null,
        inject: [OPTIONS],
      },
    ],
  };
}
