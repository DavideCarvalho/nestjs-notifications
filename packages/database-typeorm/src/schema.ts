import { type DataSource, type QueryRunner, Table, TableColumn } from 'typeorm';
import { TableUtils } from 'typeorm/schema-builder/util/TableUtils';
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

/**
 * Add any columns present in the entity metadata but missing from the live table.
 *
 * Strictly non-destructive: it only ever ADDs columns — it never drops, alters the type of,
 * renames, or otherwise touches existing columns, and it is order-independent. Each missing
 * column is built from the entity's `ColumnMetadata` the same way `Table.create` derives a
 * table (via `TableUtils.createTableColumnOptions`), so the resulting `TableColumn` is
 * driver-portable across SQLite, MySQL and Postgres.
 *
 * Forward-compat rule: any column added to {@link NotificationEntity} after v1 MUST be
 * nullable or have a default. `ADD COLUMN` of a NOT NULL column without a default fails with an
 * opaque DDL error on a table that already holds rows — so this guard detects that exact case and
 * SKIPS the column with a clear `console.warn` (naming it and pointing at a manual migration)
 * rather than letting the raw driver error surface.
 */
async function addMissingColumns(queryRunner: QueryRunner): Promise<void> {
  const metadata = queryRunner.connection.getMetadata(NotificationEntity);
  const driver = queryRunner.connection.driver;
  const table = await queryRunner.getTable(TABLE);
  if (!table) return;

  // Whether the table already holds rows — only a populated table makes a NOT-NULL-no-default
  // `ADD COLUMN` fail. Computed lazily (at most once) so an empty/fresh table pays nothing.
  let populated: boolean | undefined;
  const hasRows = async (): Promise<boolean> => {
    if (populated === undefined) {
      const [{ count } = { count: 0 }] = await queryRunner.query(
        `SELECT COUNT(*) as count FROM ${driver.escape(TABLE)}`,
      );
      populated = Number(count) > 0;
    }
    return populated;
  };

  const existing = new Set(table.columns.map((column) => column.name));
  for (const column of metadata.columns) {
    if (column.isVirtualProperty || existing.has(column.databaseName)) continue;
    const tableColumn = new TableColumn(TableUtils.createTableColumnOptions(column, driver));
    // A NOT-NULL column without a default cannot be back-filled by `ADD COLUMN` on a populated
    // table (the driver throws a raw DDL error). Skip it with a clear warning so the failure is
    // actionable instead of opaque — the operator must add it via a deliberate data migration.
    if (!tableColumn.isNullable && tableColumn.default === undefined && (await hasRows())) {
      console.warn(
        `[nestjs-notifications] Skipping auto-add of NOT NULL column "${tableColumn.name}" on the populated "${TABLE}" table — it has no default and would fail an ADD COLUMN. Add it with a manual migration (back-fill the existing rows, then set NOT NULL).`,
      );
      continue;
    }
    await queryRunner.addColumn(TABLE, tableColumn);
  }
}

/**
 * Ensure the table is up to date via a DataSource (used by the store's `ensureSchema` on
 * bootstrap). Creates the table if missing; otherwise non-destructively adds any columns that
 * exist in the entity metadata but not yet in the live table (see {@link addMissingColumns}).
 */
export async function ensureNotificationsTable(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    if (await queryRunner.hasTable(TABLE)) {
      await addMissingColumns(queryRunner);
    } else {
      await createNotificationsTable(queryRunner);
    }
  } finally {
    await queryRunner.release();
  }
}
