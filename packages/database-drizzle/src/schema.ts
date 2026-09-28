import {
  getTableConfig,
  index,
  jsonb,
  pgSchema,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

/** Default table names — the same ones the TypeORM / MikroORM adapters use. */
export const DEFAULT_TABLE_NAMES = {
  notifications: 'notifications',
  pendingDigests: 'notification_pending_digests',
  digestWindows: 'notification_digest_windows',
} as const;

/** BYO table names; each omitted one falls back to {@link DEFAULT_TABLE_NAMES}. */
export interface NotificationTableNames {
  notifications?: string;
  pendingDigests?: string;
  digestWindows?: string;
}

/** Options for {@link createNotificationTables}. */
export interface NotificationTablesOptions {
  tableNames?: NotificationTableNames;
  /** Optional Postgres schema the tables live in (default: the connection's search path). */
  schema?: string;
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeIdentifier(value: string, what: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(
      `Unsafe ${what}: ${JSON.stringify(value)}. Identifiers must match ${SAFE_IDENTIFIER} (letters, digits, underscore; not starting with a digit).`,
    );
  }
}

// Millisecond-precision timestamptz: newest-first ordering, upsert createdAt preservation and
// prune cutoffs all depend on sub-second precision (same reason the TypeORM entity uses `(3)`).
const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: 'date' });

/**
 * Build the notification tables as Drizzle `pgTable`s. Columns are snake_case (Laravel's
 * `notifications` table / the MikroORM adapter's naming). Call it once at module scope and
 * re-export the tables from the schema file your `drizzle.config.ts` points at, so drizzle-kit
 * generates the migration:
 *
 * ```ts
 * // db/schema.ts
 * import { createNotificationTables } from '@dudousxd/nestjs-notifications-database-drizzle';
 * export const notificationTables = createNotificationTables();
 * export const { notifications, pendingDigests, digestWindows } = notificationTables;
 * ```
 *
 * Hand the SAME object to the stores (`{ tables: notificationTables }`) so the queries and the
 * migration can never disagree. Index names derive from the table names, so relocating the
 * tables keeps them unique.
 */
export function createNotificationTables(opts: NotificationTablesOptions = {}) {
  const names = {
    notifications: opts.tableNames?.notifications ?? DEFAULT_TABLE_NAMES.notifications,
    pendingDigests: opts.tableNames?.pendingDigests ?? DEFAULT_TABLE_NAMES.pendingDigests,
    digestWindows: opts.tableNames?.digestWindows ?? DEFAULT_TABLE_NAMES.digestWindows,
  };
  for (const [key, name] of Object.entries(names))
    assertSafeIdentifier(name, `table name (${key})`);
  if (opts.schema !== undefined) assertSafeIdentifier(opts.schema, 'schema name');
  // `pgSchema('public')` is rejected by drizzle — the default schema IS `pgTable`.
  const table = (
    opts.schema === undefined ? pgTable : pgSchema(opts.schema).table
  ) as typeof pgTable;

  const notifications = table(
    names.notifications,
    {
      id: varchar('id', { length: 191 }).primaryKey(),
      type: varchar('type', { length: 255 }).notNull(),
      notifiableType: varchar('notifiable_type', { length: 191 }).notNull(),
      notifiableId: varchar('notifiable_id', { length: 191 }).notNull(),
      tenantId: varchar('tenant_id', { length: 191 }),
      causerType: varchar('causer_type', { length: 191 }),
      causerId: varchar('causer_id', { length: 191 }),
      traceId: varchar('trace_id', { length: 191 }),
      data: jsonb('data').$type<Record<string, unknown>>().notNull(),
      readAt: ts('read_at'),
      createdAt: ts('created_at').notNull(),
      updatedAt: ts('updated_at').notNull(),
    },
    (t) => [
      // The inbox read: `WHERE notifiable_type = ? AND notifiable_id = ? ORDER BY created_at DESC`.
      index(`${names.notifications}_notifiable_idx`).on(
        t.notifiableType,
        t.notifiableId,
        t.createdAt,
      ),
    ],
  );

  const pendingDigests = table(
    names.pendingDigests,
    {
      id: varchar('id', { length: 191 }).primaryKey(),
      /** `'daily' | 'weekly'`. */
      cadence: varchar('cadence', { length: 16 }).notNull(),
      notifiableType: varchar('notifiable_type', { length: 150 }).notNull(),
      notifiableId: varchar('notifiable_id', { length: 150 }).notNull(),
      tenantId: varchar('tenant_id', { length: 150 }),
      category: varchar('category', { length: 150 }).notNull(),
      /** The notification class name (rebuildable via the core NotificationSerializer). */
      notificationName: varchar('notification_name', { length: 255 }).notNull(),
      notificationData: jsonb('notification_data').$type<Record<string, unknown>>().notNull(),
      createdAt: ts('created_at').notNull(),
    },
    (t) => [
      // Backs the collector's grouped read (same columns as the TypeORM entity's index).
      index(`${names.pendingDigests}_group_idx`).on(
        t.cadence,
        t.tenantId,
        t.notifiableType,
        t.notifiableId,
        t.category,
      ),
    ],
  );

  const digestWindows = table(names.digestWindows, {
    /** `${cadence}:${windowKey}` — the primary key IS the idempotency lock. */
    id: varchar('id', { length: 255 }).primaryKey(),
    ranAt: ts('ran_at').notNull(),
  });

  return { notifications, pendingDigests, digestWindows };
}

/** The table set the stores query — what {@link createNotificationTables} returns. */
export type NotificationTables = ReturnType<typeof createNotificationTables>;

/** The default tables (canonical names, default schema). */
export const notificationTables: NotificationTables = createNotificationTables();

type AnyTable = Parameters<typeof getTableConfig>[0];

const q = (identifier: string) => `"${identifier}"`;

function qualified(table: AnyTable): { name: string; ref: string; schema: string | undefined } {
  const cfg = getTableConfig(table);
  assertSafeIdentifier(cfg.name, 'table name');
  if (cfg.schema !== undefined) assertSafeIdentifier(cfg.schema, 'schema name');
  return {
    name: cfg.name,
    ref: cfg.schema ? `${q(cfg.schema)}.${q(cfg.name)}` : q(cfg.name),
    schema: cfg.schema,
  };
}

const TSTZ = 'timestamp(3) with time zone';

/**
 * Idempotent Postgres DDL for the notifications table (`CREATE TABLE/INDEX IF NOT EXISTS`) —
 * never drops or alters. It is
 * what {@link DrizzleNotificationStore.ensureSchema} runs; prefer drizzle-kit when it already
 * owns your migrations.
 */
export function notificationsSchemaDdl(
  tables: Pick<NotificationTables, 'notifications'> = notificationTables,
): string[] {
  const t = qualified(tables.notifications);
  const ddl: string[] = [];
  if (t.schema) ddl.push(`CREATE SCHEMA IF NOT EXISTS ${q(t.schema)}`);
  ddl.push(
    `CREATE TABLE IF NOT EXISTS ${t.ref} (${[
      '"id" varchar(191) PRIMARY KEY NOT NULL',
      '"type" varchar(255) NOT NULL',
      '"notifiable_type" varchar(191) NOT NULL',
      '"notifiable_id" varchar(191) NOT NULL',
      '"tenant_id" varchar(191)',
      '"causer_type" varchar(191)',
      '"causer_id" varchar(191)',
      '"trace_id" varchar(191)',
      '"data" jsonb NOT NULL',
      `"read_at" ${TSTZ}`,
      `"created_at" ${TSTZ} NOT NULL`,
      `"updated_at" ${TSTZ} NOT NULL`,
    ].join(', ')})`,
  );
  ddl.push(
    `CREATE INDEX IF NOT EXISTS ${q(`${t.name}_notifiable_idx`)} ON ${t.ref} ("notifiable_type","notifiable_id","created_at")`,
  );
  return ddl;
}

/** Idempotent Postgres DDL for the pending-digest + digest-window tables. */
export function pendingDigestSchemaDdl(
  tables: Pick<NotificationTables, 'pendingDigests' | 'digestWindows'> = notificationTables,
): string[] {
  const pending = qualified(tables.pendingDigests);
  const windows = qualified(tables.digestWindows);
  const ddl: string[] = [];
  for (const schema of new Set([pending.schema, windows.schema])) {
    if (schema) ddl.push(`CREATE SCHEMA IF NOT EXISTS ${q(schema)}`);
  }
  ddl.push(
    `CREATE TABLE IF NOT EXISTS ${pending.ref} (${[
      '"id" varchar(191) PRIMARY KEY NOT NULL',
      '"cadence" varchar(16) NOT NULL',
      '"notifiable_type" varchar(150) NOT NULL',
      '"notifiable_id" varchar(150) NOT NULL',
      '"tenant_id" varchar(150)',
      '"category" varchar(150) NOT NULL',
      '"notification_name" varchar(255) NOT NULL',
      '"notification_data" jsonb NOT NULL',
      `"created_at" ${TSTZ} NOT NULL`,
    ].join(', ')})`,
  );
  ddl.push(
    `CREATE INDEX IF NOT EXISTS ${q(`${pending.name}_group_idx`)} ON ${pending.ref} ("cadence","tenant_id","notifiable_type","notifiable_id","category")`,
  );
  ddl.push(
    `CREATE TABLE IF NOT EXISTS ${windows.ref} ("id" varchar(255) PRIMARY KEY NOT NULL, "ran_at" ${TSTZ} NOT NULL)`,
  );
  return ddl;
}

/**
 * Tables these stores create and manage at boot. Feed to your migration tooling's exclude list
 * when you let `ensureSchema()` own them instead of drizzle-kit (mirrors the TypeORM adapter's
 * `notificationsManagedTables`).
 */
export function notificationsManagedTables(
  tables: NotificationTables = notificationTables,
): string[] {
  return [tables.notifications, tables.pendingDigests, tables.digestWindows].map(
    (t) => getTableConfig(t).name,
  );
}
