import { describe, expect, it } from 'vitest';

/**
 * `schema.ts` reaches into a TypeORM internal — `typeorm/schema-builder/util/TableUtils` — to build
 * a driver-portable `TableColumn` from entity metadata (`createTableColumnOptions`). That deep path
 * is not part of TypeORM's public surface, so a future bump that relocates or removes it would break
 * `addMissingColumns` only at runtime. This smoke test pins the import + the one function we use, so
 * such a relocation fails CI loudly here instead of silently in a deployment's schema bootstrap.
 */
describe('deep-import contract — typeorm internal TableUtils', () => {
  it('resolves TableUtils.createTableColumnOptions from the deep path', async () => {
    const { TableUtils } = await import('typeorm/schema-builder/util/TableUtils');
    expect(TableUtils).toBeDefined();
    expect(typeof TableUtils.createTableColumnOptions).toBe('function');
  });
});
