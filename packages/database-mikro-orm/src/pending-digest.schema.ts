import type { EntityManager } from '@mikro-orm/core';

const TABLES = ['notification_pending_digests', 'notification_digest_windows'] as const;

function generatorFor(em: EntityManager) {
  return em.getPlatform().getSchemaGenerator(em.getDriver(), em);
}

/** Statements (split, trimmed) from the non-destructive schema diff that touch our digest tables. */
async function pendingDigestStatements(em: EntityManager): Promise<string[]> {
  const sql = await generatorFor(em).getUpdateSchemaSQL({ safe: true, wrap: false });
  const matcher = new RegExp(`\\b(${TABLES.join('|')})\\b`, 'i');
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && matcher.test(s));
}

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
 */
export async function pendingDigestSchemaSql(em: EntityManager): Promise<string> {
  const statements = await pendingDigestStatements(em);
  return statements.length ? `${statements.join(';\n')};` : '';
}

/** Apply the non-destructive diff for the digest tables (used by the store on bootstrap). */
export async function ensurePendingDigestTables(em: EntityManager): Promise<void> {
  const statements = await pendingDigestStatements(em);
  if (statements.length === 0) return;
  const connection = em.getConnection();
  for (const statement of statements) {
    await connection.execute(statement);
  }
}
