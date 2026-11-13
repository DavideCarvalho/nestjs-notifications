import { createHash } from 'node:crypto';
import type { EntityManager, EntityMetadata } from '@mikro-orm/core';
import { schemaOf, tableSql } from './schema-name';

/**
 * Hand-bump when a DDL change is NOT visible in the entity metadata this fingerprint hashes
 * (e.g. a collation/charset tweak, an index expression, or a default rendered only at DDL time).
 * Bumping invalidates every stored fingerprint and forces one heal-and-rewrite on the next boot.
 */
export const SCHEMA_REVISION = 1;

/** Single-row marker table that records the last-applied schema fingerprint. */
export const SCHEMA_META_TABLE = 'notifications_schema_meta';
/** The marker row id — one row per owned schema. */
export const SCHEMA_META_ID = 'notifications';
/** Advisory-lock key used to serialize concurrent self-heals across booting replicas. */
const ADVISORY_LOCK_KEY = 'notifications_schema';

/** The marker table, qualified with `schema` when given. */
function metaTable(em: EntityManager, schema: string | undefined): string {
  return schema === undefined ? SCHEMA_META_TABLE : tableSql(em, SCHEMA_META_TABLE, schema);
}

/** The advisory-lock key: per schema, so heals of different schemas never wait on each other. */
function lockKey(schema: string | undefined): string {
  return schema === undefined ? ADVISORY_LOCK_KEY : `${ADVISORY_LOCK_KEY}:${schema}`;
}

type JsonPrimitive = string | number | boolean | null;

interface FingerprintColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
  default: JsonPrimitive;
  autoincrement: boolean;
}

interface FingerprintIndex {
  name: string;
  properties: string[];
}

interface FingerprintTable {
  tableName: string;
  columns: FingerprintColumn[];
  indexes: FingerprintIndex[];
}

interface FingerprintInput {
  revision: string;
  platform: string;
  collate: string;
  tables: FingerprintTable[];
}

/** A single row read back from the marker table. */
interface SchemaMetaRow {
  fingerprint?: string | null;
}

/** Result of a DML statement, when the driver reports it. */
interface MutationResult {
  affectedRows?: number;
}

/** The owned schemas grouped by SQL dialect, used to pick lock/upsert syntax. */
type Dialect = 'mysql' | 'postgres' | 'sqlite' | 'unknown';

/** A best-effort advisory lock; {@link SchemaLock.release} is a no-op when no lock was taken. */
interface SchemaLock {
  release(): Promise<void>;
}

const NOOP_LOCK: SchemaLock = {
  release: async () => undefined,
};

/** Defaults materialize as `undefined` on properties without one — normalize to `null` so the hash is stable. */
function normalizeColumnDefault(
  value: string | number | boolean | null | undefined,
): JsonPrimitive {
  return value === undefined ? null : value;
}

/** Normalize a MikroORM index's `properties` (string | string[] | undefined) to a sorted string list. */
function normalizeIndexProperties(properties: string | string[] | undefined): string[] {
  if (properties === undefined) {
    return [];
  }
  const list = Array.isArray(properties) ? properties : [properties];
  return [...list]
    .map((property) => String(property))
    .sort((left, right) => left.localeCompare(right));
}

/** Build the canonical (sorted) column list for one entity's owned table. */
function buildFingerprintTable(meta: EntityMetadata): FingerprintTable {
  const columns: FingerprintColumn[] = [];
  for (const property of meta.props) {
    // Relations/collections without a backing column, and explicitly non-persisted props, never reach SQL.
    if (property.persist === false) {
      continue;
    }
    const fieldNames = property.fieldNames ?? [];
    fieldNames.forEach((fieldName, index) => {
      columns.push({
        name: fieldName,
        type: property.columnTypes?.[index] ?? String(property.type),
        nullable: property.nullable === true,
        primary: property.primary === true,
        default: normalizeColumnDefault(property.default),
        autoincrement: property.autoincrement === true,
      });
    });
  }
  columns.sort((left, right) => left.name.localeCompare(right.name));

  const indexes: FingerprintIndex[] = [];
  for (const definition of [...meta.indexes, ...meta.uniques]) {
    indexes.push({
      name: definition.name ?? '',
      properties: normalizeIndexProperties(definition.properties),
    });
  }
  indexes.sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    return byName !== 0
      ? byName
      : left.properties.join(',').localeCompare(right.properties.join(','));
  });

  return { tableName: meta.tableName, columns, indexes };
}

/**
 * Serialize the fingerprint input with object keys written in alphabetical order and every list
 * pre-sorted by its builder, so the JSON is canonical (key/table/column/index order is stable).
 */
function serializeFingerprintInput(input: FingerprintInput): string {
  return JSON.stringify({
    collate: input.collate,
    platform: input.platform,
    revision: input.revision,
    tables: input.tables.map((table) => ({
      columns: table.columns.map((column) => ({
        autoincrement: column.autoincrement,
        default: column.default,
        name: column.name,
        nullable: column.nullable,
        primary: column.primary,
        type: column.type,
      })),
      indexes: table.indexes.map((index) => ({
        name: index.name,
        properties: index.properties,
      })),
      tableName: table.tableName,
    })),
  });
}

/**
 * Compute the fingerprint the database SHOULD have, purely from in-memory entity metadata — no DB
 * round-trip. Hashes the owned tables' canonical shape plus the configured collation, the platform
 * name, and {@link SCHEMA_REVISION}, so any structural drift (or a revision bump) changes the digest.
 */
export function computeExpectedFingerprint(
  em: EntityManager,
  ownedTableNames: ReadonlySet<string>,
  schema?: string,
): string {
  const tables: FingerprintTable[] = [];
  for (const meta of em.getMetadata().getAll().values()) {
    if (!ownedTableNames.has(meta.tableName)) {
      continue;
    }
    // With `schema`, only the entities built for that schema count; without it, none of them do.
    if (schemaOf(meta.class) !== schema) {
      continue;
    }
    tables.push(buildFingerprintTable(meta));
  }
  tables.sort((left, right) => left.tableName.localeCompare(right.tableName));

  const collate = em.config.get('collate');
  const input: FingerprintInput = {
    revision: String(SCHEMA_REVISION),
    platform: em.getPlatform().constructor.name,
    collate: typeof collate === 'string' ? collate : '',
    tables,
  };
  return createHash('sha256').update(serializeFingerprintInput(input)).digest('hex');
}

/** Lower-cased dialect family, derived from the platform class name (no DB round-trip). */
function platformDialect(em: EntityManager): Dialect {
  const name = em.getPlatform().constructor.name.toLowerCase();
  if (name.includes('mysql') || name.includes('maria')) {
    return 'mysql';
  }
  if (name.includes('postgre')) {
    return 'postgres';
  }
  if (name.includes('sqlite') || name.includes('libsql')) {
    return 'sqlite';
  }
  return 'unknown';
}

/**
 * Idempotently create the marker table. Uses `create table if not exists` — no `information_schema`
 * introspection — so it is safe to run on every boot, including against a completely empty database.
 */
export async function ensureSchemaMetaTable(em: EntityManager, schema?: string): Promise<void> {
  await em
    .getConnection()
    .execute(
      `create table if not exists ${metaTable(em, schema)} (id varchar(32) primary key, fingerprint varchar(64) not null, applied_at bigint not null)`,
    );
}

/** Read the last-applied fingerprint for the owned schema, or `undefined` when the row is absent. */
export async function readStoredFingerprint(
  em: EntityManager,
  schema?: string,
): Promise<string | undefined> {
  const rows: SchemaMetaRow[] = await em
    .getConnection()
    .execute(
      `select fingerprint from ${metaTable(em, schema)} where id = ?`,
      [SCHEMA_META_ID],
      'all',
    );
  const fingerprint = Array.isArray(rows) ? rows[0]?.fingerprint : undefined;
  return typeof fingerprint === 'string' ? fingerprint : undefined;
}

/** Upsert the marker row with the freshly-applied fingerprint and an epoch-ms `applied_at`. */
export async function writeSchemaFingerprint(
  em: EntityManager,
  fingerprint: string,
  schema?: string,
): Promise<void> {
  const connection = em.getConnection();
  const table = metaTable(em, schema);
  const appliedAt = Date.now();
  const params = [SCHEMA_META_ID, fingerprint, appliedAt];

  switch (platformDialect(em)) {
    case 'mysql':
      await connection.execute(
        `insert into ${table} (id, fingerprint, applied_at) values (?, ?, ?) on duplicate key update fingerprint = values(fingerprint), applied_at = values(applied_at)`,
        params,
        'run',
      );
      return;
    case 'postgres':
    case 'sqlite':
      await connection.execute(
        `insert into ${table} (id, fingerprint, applied_at) values (?, ?, ?) on conflict (id) do update set fingerprint = excluded.fingerprint, applied_at = excluded.applied_at`,
        params,
        'run',
      );
      return;
    default: {
      // Unknown dialect: assume no native upsert syntax — update first, insert only when no row exists.
      const updated: MutationResult = await connection.execute(
        `update ${table} set fingerprint = ?, applied_at = ? where id = ?`,
        [fingerprint, appliedAt, SCHEMA_META_ID],
        'run',
      );
      if (updated?.affectedRows && updated.affectedRows > 0) {
        return;
      }
      try {
        await connection.execute(
          `insert into ${table} (id, fingerprint, applied_at) values (?, ?, ?)`,
          params,
          'run',
        );
      } catch {
        // A concurrent boot inserted the row first — its fingerprint is equivalent, leave it.
      }
    }
  }
}

/**
 * Acquire a best-effort advisory lock so concurrent booting replicas don't all run the heal. The
 * lock is an optimization, never a correctness requirement: any failure (or an engine without
 * advisory locks, e.g. SQLite) falls through to a no-op lock and the heal proceeds unguarded.
 */
export async function acquireSchemaLock(em: EntityManager, schema?: string): Promise<SchemaLock> {
  const connection = em.getConnection();
  const key = lockKey(schema);
  try {
    switch (platformDialect(em)) {
      case 'mysql':
        await connection.execute('select get_lock(?, 10) as locked', [key], 'all');
        return {
          release: async () => {
            try {
              await connection.execute('select release_lock(?) as released', [key], 'all');
            } catch {
              // The lock auto-releases when the connection returns to the pool.
            }
          },
        };
      case 'postgres':
        await connection.execute('select pg_advisory_lock(hashtext(?))', [key], 'all');
        return {
          release: async () => {
            try {
              await connection.execute('select pg_advisory_unlock(hashtext(?))', [key], 'all');
            } catch {
              // The advisory lock auto-releases with the session.
            }
          },
        };
      default:
        return NOOP_LOCK;
    }
  } catch {
    // Advisory locks are an optimization — proceed without one.
    return NOOP_LOCK;
  }
}
