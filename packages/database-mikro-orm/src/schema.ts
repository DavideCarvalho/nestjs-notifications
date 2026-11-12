import type { EntityManager } from '@mikro-orm/core';
import { createSchemaIfMissing, safeStatementsFor } from './schema-name';

const TABLE = 'notifications';

/** Where the notifications table lives. */
export interface NotificationsSchemaOptions {
  /**
   * The schema (Postgres) or database (MySQL) of the table; every statement names it
   * (`search_path` is never used). Register `notificationEntity({ schema })` in the ORM. SQLite has
   * none: setting it throws.
   */
  schema?: string | undefined;
}

/**
 * Returns the non-destructive SQL needed to bring only the `notifications` table up to date
 * (creates it / adds missing columns and indexes). Use it inside a MikroORM migration:
 *
 * ```ts
 * import { notificationsSchemaSql } from '@dudousxd/nestjs-notifications-database-mikro-orm';
 * export class AddNotifications extends Migration {
 *   async up() { this.addSql(await notificationsSchemaSql(this.getEntityManager())); }
 * }
 * ```
 *
 * With `schema`, only statements on `schema.notifications` are returned; create the schema first.
 */
export async function notificationsSchemaSql(
  em: EntityManager,
  options: NotificationsSchemaOptions = {},
): Promise<string> {
  const statements = await safeStatementsFor(em, [TABLE], options.schema);
  return statements.length ? `${statements.join(';\n')};` : '';
}

/**
 * Apply the non-destructive diff for the `notifications` table (used by the store on bootstrap).
 * With `schema`, the schema (MySQL: database) is created first.
 */
export async function ensureNotificationsTable(
  em: EntityManager,
  options: NotificationsSchemaOptions = {},
): Promise<void> {
  if (options.schema !== undefined) await createSchemaIfMissing(em, options.schema);
  const statements = await safeStatementsFor(em, [TABLE], options.schema);
  const connection = em.getConnection();
  for (const statement of statements) {
    await connection.execute(statement);
  }
}
