import { type DataSource, type EntityTarget, type QueryRunner, Table, TableColumn } from 'typeorm';
import { TableUtils } from 'typeorm/schema-builder/util/TableUtils.js';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';

const PENDING_TABLE = 'notification_pending_digests';
const WINDOW_TABLE = 'notification_digest_windows';

/** Create a table from its entity metadata if it doesn't exist (non-destructive, driver-portable). */
async function createTableFor(
  queryRunner: QueryRunner,
  table: string,
  entity: EntityTarget<object>,
): Promise<void> {
  if (await queryRunner.hasTable(table)) return;
  const metadata = queryRunner.connection.getMetadata(entity);
  await queryRunner.createTable(Table.create(metadata, queryRunner.connection.driver), true);
}

/**
 * Add any columns present in the entity metadata but missing from the live table. Strictly
 * non-destructive (only ever ADDs columns; never drops/alters/renames). A NOT-NULL column without
 * a default cannot be back-filled by `ADD COLUMN` on a populated table, so that exact case is
 * skipped with a clear warning. Mirrors the notifications-table guard.
 */
async function addMissingColumns(
  queryRunner: QueryRunner,
  table: string,
  entity: EntityTarget<object>,
): Promise<void> {
  const metadata = queryRunner.connection.getMetadata(entity);
  const driver = queryRunner.connection.driver;
  const live = await queryRunner.getTable(table);
  if (!live) return;

  let populated: boolean | undefined;
  const hasRows = async (): Promise<boolean> => {
    if (populated === undefined) {
      const [{ count } = { count: 0 }] = await queryRunner.query(
        `SELECT COUNT(*) as count FROM ${driver.escape(table)}`,
      );
      populated = Number(count) > 0;
    }
    return populated;
  };

  const existing = new Set(live.columns.map((column) => column.name));
  for (const column of metadata.columns) {
    if (column.isVirtualProperty || existing.has(column.databaseName)) continue;
    const tableColumn = new TableColumn(TableUtils.createTableColumnOptions(column, driver));
    if (!tableColumn.isNullable && tableColumn.default === undefined && (await hasRows())) {
      console.warn(
        `[nestjs-notifications] Skipping auto-add of NOT NULL column "${tableColumn.name}" on the populated "${table}" table — it has no default and would fail an ADD COLUMN. Add it with a manual migration.`,
      );
      continue;
    }
    await queryRunner.addColumn(table, tableColumn);
  }
}

/**
 * Create the pending-digest + digest-window tables if missing (non-destructive). Call it inside a
 * TypeORM migration's `up`, and `dropTable` both in `down`.
 */
export async function createPendingDigestTables(queryRunner: QueryRunner): Promise<void> {
  await createTableFor(queryRunner, PENDING_TABLE, PendingDigestEntity);
  await createTableFor(queryRunner, WINDOW_TABLE, DigestWindowEntity);
}

/**
 * Ensure the digest tables are up to date via a DataSource (used by the store's `ensureSchema` on
 * bootstrap). Creates each table if missing; otherwise non-destructively adds any columns that
 * exist in the entity metadata but not yet in the live table.
 */
export async function ensurePendingDigestTables(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    for (const [table, entity] of [
      [PENDING_TABLE, PendingDigestEntity],
      [WINDOW_TABLE, DigestWindowEntity],
    ] as const) {
      if (await queryRunner.hasTable(table)) {
        await addMissingColumns(queryRunner, table, entity);
      } else {
        await createTableFor(queryRunner, table, entity);
      }
    }
  } finally {
    await queryRunner.release();
  }
}
