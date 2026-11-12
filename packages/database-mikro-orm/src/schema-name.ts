import type { EntityManager } from '@mikro-orm/core';
import { Entity } from '@mikro-orm/decorators/legacy';

/**
 * DI token for the stores' options (`{ schema }`), bound by the store modules' `forFeature`. Absent:
 * the stores run unqualified.
 */
export const MIKRO_ORM_NOTIFICATIONS_OPTIONS = Symbol.for(
  'nestjs-notifications:mikro-orm-store-options',
);

const SCHEMA_NAME = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** Validates a `schema` option: a letter or `_`, then letters, digits, `_` or `$`, ≤ 63 chars. */
export function assertSchemaName(schema: string): void {
  if (typeof schema !== 'string' || !SCHEMA_NAME.test(schema) || schema.length > 63) {
    throw new TypeError(
      `[nestjs-notifications] \`schema\` must match /^[A-Za-z_][A-Za-z0-9_$]*$/ and be at most 63 characters, got ${JSON.stringify(schema)}`,
    );
  }
}

/** The dialect family of an EntityManager, from its platform. */
export function dialectOf(em: EntityManager): 'postgres' | 'mysql' | 'sqlite' | 'other' {
  const name = em.getPlatform().constructor.name.toLowerCase();
  if (name.includes('postgre')) return 'postgres';
  if (name.includes('mysql') || name.includes('maria')) return 'mysql';
  if (name.includes('sqlite') || name.includes('libsql')) return 'sqlite';
  return 'other';
}

/** SQLite has no schemas: a `schema` there fails instead of being ignored. */
export function assertSchemaSupported(em: EntityManager, schema: string | undefined): void {
  if (schema !== undefined && dialectOf(em) === 'sqlite') {
    throw new Error(
      `[nestjs-notifications] \`schema: ${JSON.stringify(schema)}\` was set, but SQLite has no schemas. Remove \`schema\`, or use Postgres or MySQL.`,
    );
  }
}

/** `table`, or `"schema"."table"` (`` `db`.`table` `` on MySQL), for raw SQL. */
export function tableSql(em: EntityManager, table: string, schema: string | undefined): string {
  if (schema === undefined) return table;
  const platform = em.getPlatform();
  return `${platform.quoteIdentifier(schema)}.${platform.quoteIdentifier(table)}`;
}

/** Creates `schema` (Postgres) or the database of that name (MySQL) when it is missing. */
export async function createSchemaIfMissing(em: EntityManager, schema: string): Promise<void> {
  assertSchemaSupported(em, schema);
  const mysql = dialectOf(em) === 'mysql';
  const name = em.getPlatform().quoteIdentifier(schema);
  // Checked first: `CREATE SCHEMA IF NOT EXISTS` needs the CREATE privilege even when it exists.
  const existing: unknown[] = await em
    .getConnection()
    .execute('select 1 from information_schema.schemata where schema_name = ?', [schema], 'all');
  if (existing.length > 0) return;
  try {
    await em
      .getConnection()
      .execute(
        mysql ? `create database if not exists ${name}` : `create schema if not exists ${name}`,
      );
  } catch (error) {
    throw Object.assign(
      new Error(
        mysql
          ? `[nestjs-notifications] could not create the database \`${schema}\`. Create it yourself, or grant the user CREATE: GRANT CREATE ON \`${schema}\`.* TO <user>. (${(error as Error).message})`
          : `[nestjs-notifications] could not create the schema "${schema}". Create it yourself, or grant the role CREATE on the database: GRANT CREATE ON DATABASE <db> TO <role>. (${(error as Error).message})`,
      ),
      { cause: error },
    );
  }
}

/**
 * The additive (safe) update statements that touch `tables`, from MikroORM's schema diff. Without
 * `schema`, a statement matches on the bare table name (today's behaviour); with it, only statements
 * on the qualified `schema.table` count, so nothing outside the schema is ever touched.
 */
export async function safeStatementsFor(
  em: EntityManager,
  tables: readonly string[],
  schema: string | undefined,
): Promise<string[]> {
  const platform = em.getPlatform();
  if (schema === undefined) {
    const generator = platform.getSchemaGenerator(em.getDriver(), em);
    const sql = await generator.getUpdateSchemaSQL({ safe: true, wrap: false });
    const matcher = new RegExp(`\\b(${tables.join('|')})\\b`, 'i');
    return sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && matcher.test(s));
  }
  const generator = platform.getSchemaGenerator(driverIn(em, schema)) as unknown as {
    getUpdateSchemaSQL(options: { safe: boolean; wrap: boolean }): Promise<string>;
  };
  const sql = await generator.getUpdateSchemaSQL({ safe: true, wrap: false });
  const qualified = tables.map((t) => tableSql(em, t, schema));
  return sql
    .split(/;\s*\n/)
    .map((statement) => statement.trim().replace(/;$/, ''))
    .filter((statement) => statement !== '' && qualified.some((t) => statement.includes(t)));
}

/** The catalog filters MikroORM's MySQL introspection pins to the connection's current database. */
const MYSQL_CATALOG_FILTER =
  /\b(table_schema|constraint_schema|routine_schema|specific_schema|event_object_schema)\s*=\s*(?:database|schema)\(\)/gi;

/**
 * The driver the schema generator reads, for `schema`. MikroORM introspects MySQL only in the
 * connection's current database (`table_schema = database()`), so it would never see a table in
 * another one and create it again on every boot. On MySQL this view rewrites those catalog filters,
 * in the generator's `information_schema` reads alone, to the configured database. Nothing switches
 * the session's database (`USE`), which would leak to the next user of the pooled connection.
 * Other dialects get the driver as it is.
 */
function driverIn(em: EntityManager, schema: string): ReturnType<EntityManager['getDriver']> {
  const driver = em.getDriver();
  if (dialectOf(em) !== 'mysql') return driver;
  const connection = driver.getConnection();
  const view = new Proxy(connection, {
    get(target, property) {
      if (property === 'execute') {
        return (query: unknown, ...rest: unknown[]) =>
          (target.execute as (...args: unknown[]) => unknown).call(
            target,
            typeof query === 'string' && /information_schema/i.test(query)
              ? query.replace(
                  MYSQL_CATALOG_FILTER,
                  (_match, column: string) => `${column} = '${schema}'`,
                )
              : query,
            ...rest,
          );
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new Proxy(driver, {
    get(target, property) {
      if (property === 'getConnection') return () => view;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

type EntityClass = abstract new (...args: never[]) => object;

const schemaOfEntity = new WeakMap<object, string>();
const bySchema = new Map<string, Map<object, EntityClass>>();

/**
 * The entity `base` in `schema`: a subclass registered as its own entity (named
 * `<Base>_<schema>`) with `schema` set, so MikroORM qualifies every query, and on MySQL uses
 * `schema` as the database. It inherits the columns and indices. Same `base` and `schema`, same
 * class, so an app can register several schemas side by side.
 */
export function entityInSchema<T extends EntityClass>(
  base: T,
  options: { tableName: string; repository: () => unknown },
  schema: string,
): T {
  assertSchemaName(schema);
  let entities = bySchema.get(schema);
  if (!entities) {
    entities = new Map();
    bySchema.set(schema, entities);
  }
  let entity = entities.get(base);
  if (!entity) {
    const name = `${base.name}_${schema}`;
    const Base = base as unknown as new () => object;
    entity = { [name]: class extends Base {} }[name] as unknown as EntityClass;
    Entity({
      tableName: options.tableName,
      schema,
      repository: options.repository as never,
    })(entity as never);
    schemaOfEntity.set(entity, schema);
    entities.set(base, entity);
  }
  return entity as T;
}

/** The `schema` an entity built by {@link entityInSchema} lives in; `undefined` for the base one. */
export function schemaOf(entity: unknown): string | undefined {
  return typeof entity === 'function' ? schemaOfEntity.get(entity) : undefined;
}
