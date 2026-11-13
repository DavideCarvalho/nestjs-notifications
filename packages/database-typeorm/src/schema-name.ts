import { type DataSource, Entity, type QueryRunner } from 'typeorm';

const SCHEMA_NAME = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** Validates a `schema` option: a letter or `_`, then letters, digits, `_` or `$`, ≤ 63 chars. */
export function assertSchemaName(schema: string): void {
  if (typeof schema !== 'string' || !SCHEMA_NAME.test(schema) || schema.length > 63) {
    throw new TypeError(
      `[nestjs-notifications] \`schema\` must match /^[A-Za-z_][A-Za-z0-9_$]*$/ and be at most 63 characters, got ${JSON.stringify(schema)}`,
    );
  }
}

/** Drivers without schemas: a `schema` there fails instead of being ignored. */
const SQLITE_DRIVERS = new Set([
  'sqlite',
  'better-sqlite3',
  'sqljs',
  'capacitor',
  'cordova',
  'expo',
  'nativescript',
  'react-native',
]);

/** Fails when `schema` is set on a driver without schemas (SQLite). */
export function assertSchemaSupported(dataSource: DataSource, schema: string | undefined): void {
  if (schema !== undefined && SQLITE_DRIVERS.has(String(dataSource.options.type))) {
    throw new Error(
      `[nestjs-notifications] \`schema: ${JSON.stringify(schema)}\` was set, but ${dataSource.options.type} has no schemas. Remove \`schema\`, or use Postgres or MySQL.`,
    );
  }
}

function isMysql(dataSource: DataSource): boolean {
  return ['mysql', 'mariadb', 'aurora-mysql'].includes(String(dataSource.options.type));
}

/** Creates `schema` (Postgres) or the database of that name (MySQL) when it is missing. */
export async function createSchemaIfMissing(
  queryRunner: QueryRunner,
  dataSource: DataSource,
  schema: string,
): Promise<void> {
  const mysql = isMysql(dataSource);
  // Checked first: `CREATE SCHEMA IF NOT EXISTS` needs the CREATE privilege even when it exists.
  if (mysql ? await queryRunner.hasDatabase(schema) : await queryRunner.hasSchema(schema)) return;
  try {
    if (mysql) await queryRunner.createDatabase(schema, true);
    else await queryRunner.createSchema(schema, true);
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

/** `"schema"."table"` (or `` `db`.`table` ``): each part of a table path quoted on its own. */
export function quotePath(dataSource: DataSource, path: string): string {
  return path
    .split('.')
    .map((part) => dataSource.driver.escape(part))
    .join('.');
}

type EntityClass = abstract new (...args: never[]) => object;

const schemaOfEntity = new WeakMap<object, string>();
const bySchema = new Map<string, Map<object, EntityClass>>();

/**
 * The entity `base` in `schema`: a subclass registered as its own entity with `schema` (Postgres)
 * and `database` (MySQL) set, so each driver qualifies every statement with the one it uses. It
 * inherits the columns and indices. Same `base` and `schema`, same class.
 */
export function entityInSchema<T extends EntityClass>(base: T, table: string, schema: string): T {
  assertSchemaName(schema);
  let entities = bySchema.get(schema);
  if (!entities) {
    entities = new Map();
    bySchema.set(schema, entities);
  }
  let entity = entities.get(base);
  if (!entity) {
    entity = class extends (base as unknown as new () => object) {} as unknown as EntityClass;
    Object.defineProperty(entity, 'name', { value: `${base.name}_${schema}` });
    Entity({ name: table, schema, database: schema })(entity as unknown as new () => object);
    schemaOfEntity.set(entity, schema);
    entities.set(base, entity);
  }
  return entity as T;
}

/** The `schema` an entity built by {@link entityInSchema} lives in; `undefined` for the base one. */
export function schemaOf(entity: unknown): string | undefined {
  return typeof entity === 'function' ? schemaOfEntity.get(entity) : undefined;
}
