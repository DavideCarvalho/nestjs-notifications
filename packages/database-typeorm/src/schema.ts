import { type DataSource, type QueryRunner, Table } from 'typeorm';
import { NotificationEntity } from './notification.entity';

const TABLE = 'notifications';

/**
 * Create the notifications table if it doesn't exist (non-destructive, driver-portable —
 * the column types come from the entity metadata). Call it inside a TypeORM migration:
 *
 * ```ts
 * import { createNotificationsTable } from '@dudousxd/nestjs-notifications-database-typeorm';
 * export class AddNotifications1700000000000 implements MigrationInterface {
 *   async up(qr: QueryRunner) { await createNotificationsTable(qr); }
 *   async down(qr: QueryRunner) { await qr.dropTable('notifications', true); }
 * }
 * ```
 */
export async function createNotificationsTable(queryRunner: QueryRunner): Promise<void> {
  if (await queryRunner.hasTable(TABLE)) return;
  const metadata = queryRunner.connection.getMetadata(NotificationEntity);
  await queryRunner.createTable(Table.create(metadata, queryRunner.connection.driver), true);
}

/** Ensure the table exists via a DataSource (used by the store's `ensureSchema` on bootstrap). */
export async function ensureNotificationsTable(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await createNotificationsTable(queryRunner);
  } finally {
    await queryRunner.release();
  }
}
