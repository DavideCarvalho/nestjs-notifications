import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/**
 * Any Drizzle Postgres database or transaction (`drizzle(pool)`, `drizzle(pglite)`, a `tx`, ...).
 * The app owns the connection; the stores never open one.
 */
export type DrizzlePgDatabase = PgDatabase<PgQueryResultHKT, any, any>;

/**
 * DI token for the app-owned Drizzle database the stores query. Bound by the modules' `forRoot`
 * / `forRootAsync`, or provide it yourself (e.g. from a shared `DbModule`) and use `forFeature()`.
 */
export const DRIZZLE_NOTIFICATIONS_DB = Symbol.for('nestjs-notifications:drizzle-db');

/** DI token for a custom {@link NotificationTables} set (BYO names / schema). Optional. */
export const DRIZZLE_NOTIFICATION_TABLES = Symbol.for('nestjs-notifications:drizzle-tables');
