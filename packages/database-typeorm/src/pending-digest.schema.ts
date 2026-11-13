import { type DataSource, type EntityTarget, type QueryRunner, Table, TableColumn } from 'typeorm';
import { TableUtils } from 'typeorm/schema-builder/util/TableUtils.js';
import { digestWindowEntity, pendingDigestEntity } from './pending-digest.entity';
import type { NotificationsSchemaOptions } from './schema';
import { assertSchemaSupported, createSchemaIfMissing, quotePath } from './schema-name';

/** The digest entities, in `schema` when given. */
function digestEntities(options: NotificationsSchemaOptions): EntityTarget<object>[] {
  return [pendingDigestEntity(options), digestWindowEntity(options)];
}

/** Create a table from its entity metadata if it doesn't exist (non-destructive, driver-portable). */
async function createTableFor(
  queryRunner: QueryRunner,
  entity: EntityTarget<object>,
): Promise<void> {
  const metadata = queryRunner.connection.getMetadata(entity);
  if (await queryRunner.hasTable(metadata.tablePath)) return;
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
  entity: EntityTarget<object>,
): Promise<void> {
  const metadata = queryRunner.connection.getMetadata(entity);
  const table = metadata.tablePath;
  const driver = queryRunner.connection.driver;
  const live = await queryRunner.getTable(table);
  if (!live) return;

  let populated: boolean | undefined;
  const hasRows = async (): Promise<boolean> => {
    if (populated === undefined) {
      const [{ count } = { count: 0 }] = await queryRunner.query(
        `SELECT COUNT(*) as count FROM ${quotePath(queryRunner.connection, table)}`,
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
export async function createPendingDigestTables(
  queryRunner: QueryRunner,
  options: NotificationsSchemaOptions = {},
): Promise<void> {
  assertSchemaSupported(queryRunner.connection, options.schema);
  if (options.schema !== undefined) {
    await createSchemaIfMissing(queryRunner, queryRunner.connection, options.schema);
  }
  for (const entity of digestEntities(options)) await createTableFor(queryRunner, entity);
}

/**
 * Ensure the digest tables are up to date via a DataSource (used by the store's `ensureSchema` on
 * bootstrap). Creates each table if missing; otherwise non-destructively adds any columns that
 * exist in the entity metadata but not yet in the live table.
 */
export async function ensurePendingDigestTables(
  dataSource: DataSource,
  options: NotificationsSchemaOptions = {},
): Promise<void> {
  assertSchemaSupported(dataSource, options.schema);
  const queryRunner = dataSource.createQueryRunner();
  try {
    if (options.schema !== undefined) {
      await createSchemaIfMissing(queryRunner, dataSource, options.schema);
    }
    for (const entity of digestEntities(options)) {
      if (await queryRunner.hasTable(dataSource.getMetadata(entity).tablePath)) {
        await addMissingColumns(queryRunner, entity);
      } else {
        await createTableFor(queryRunner, entity);
      }
    }
  } finally {
    await queryRunner.release();
  }
}
