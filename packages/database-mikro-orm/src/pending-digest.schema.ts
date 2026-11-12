import type { EntityManager } from '@mikro-orm/core';
import type { NotificationsSchemaOptions } from './schema';
import { createSchemaIfMissing, safeStatementsFor } from './schema-name';

const TABLES = ['notification_pending_digests', 'notification_digest_windows'] as const;

/**
 * Returns the non-destructive SQL needed to bring only the digest tables up to date (creates them /
 * adds missing columns). Use it inside a MikroORM migration:
 *
 * ```ts
 * import { pendingDigestSchemaSql } from '@dudousxd/nestjs-notifications-database-mikro-orm';
 * export class AddPendingDigests extends Migration {
 *   async up() { this.addSql(await pendingDigestSchemaSql(this.getEntityManager())); }
 * }
 * ```
 *
 * With `schema`, only statements on the tables in that schema are returned; create it first.
 */
export async function pendingDigestSchemaSql(
  em: EntityManager,
  options: NotificationsSchemaOptions = {},
): Promise<string> {
  const statements = await safeStatementsFor(em, TABLES, options.schema);
  return statements.length ? `${statements.join(';\n')};` : '';
}

/**
 * Apply the non-destructive diff for the digest tables (used by the store on bootstrap). With
 * `schema`, the schema (MySQL: database) is created first.
 */
export async function ensurePendingDigestTables(
  em: EntityManager,
  options: NotificationsSchemaOptions = {},
): Promise<void> {
  if (options.schema !== undefined) await createSchemaIfMissing(em, options.schema);
  const statements = await safeStatementsFor(em, TABLES, options.schema);
  const connection = em.getConnection();
  for (const statement of statements) {
    await connection.execute(statement);
  }
}
