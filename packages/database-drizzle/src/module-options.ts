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

/** Options for the Drizzle store modules' `forRoot`. */
export interface DrizzleStoreModuleOptions {
  /** The app-owned Drizzle Postgres database. */
  db: DrizzlePgDatabase;
  /**
   * The tables to query — the SAME object you spread into your drizzle-kit schema (built with
   * `createNotificationTables`). Defaults to the canonical names in the default schema.
   */
  tables?: NotificationTables;
}

/** Options for the Drizzle store modules' `forRootAsync`. */
export interface DrizzleStoreModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  useFactory: (...args: never[]) => DrizzleStoreModuleOptions | Promise<DrizzleStoreModuleOptions>;
}

const OPTIONS = Symbol('nestjs-notifications:drizzle-store-options');

/** Providers binding the db + tables tokens from static options. */
export function staticProviders(options: DrizzleStoreModuleOptions): Provider[] {
  return [
    { provide: DRIZZLE_NOTIFICATIONS_DB, useValue: options.db },
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
        useFactory: (o: DrizzleStoreModuleOptions) => o.db,
        inject: [OPTIONS],
      },
      {
        provide: DRIZZLE_NOTIFICATION_TABLES,
        useFactory: (o: DrizzleStoreModuleOptions) => o.tables ?? null,
        inject: [OPTIONS],
      },
    ],
  };
}
