import type { EntityManager } from '@mikro-orm/core';

const TABLE = 'notifications';

function generatorFor(em: EntityManager) {
  return em.getPlatform().getSchemaGenerator(em.getDriver(), em);
}

/** Statements (split, trimmed) from the non-destructive schema diff that touch our table. */
async function notificationsStatements(em: EntityManager): Promise<string[]> {
  const sql = await generatorFor(em).getUpdateSchemaSQL({ safe: true, wrap: false });
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && new RegExp(`\\b${TABLE}\\b`, 'i').test(s));
}

/**
 * Returns the non-destructive SQL needed to bring only the `notifications` table up to date
 * (creates it / adds missing columns). Use it inside a MikroORM migration:
 *
 * ```ts
 * import { notificationsSchemaSql } from '@dudousxd/nestjs-notifications-database-mikro-orm';
 * export class AddNotifications extends Migration {
 *   async up() { this.addSql(await notificationsSchemaSql(this.getEntityManager())); }
 * }
 * ```
 */
export async function notificationsSchemaSql(em: EntityManager): Promise<string> {
  const statements = await notificationsStatements(em);
  return statements.length ? `${statements.join(';\n')};` : '';
}

/** Apply the non-destructive diff for the `notifications` table (used by the store on bootstrap). */
export async function ensureNotificationsTable(em: EntityManager): Promise<void> {
  const statements = await notificationsStatements(em);
  if (statements.length === 0) return;
  const connection = em.getConnection();
  for (const statement of statements) {
    await connection.execute(statement);
  }
}
