import { type ValidationAdapter, defineConfig } from '@dudousxd/nestjs-codegen';

/**
 * `forms` are disabled, so this adapter is never invoked — it only satisfies the required
 * `validation` field. Swap in a real adapter (e.g. `zodAdapter` from `@dudousxd/nestjs-codegen-zod`)
 * and enable `forms` to also emit client-side validation schemas (`forms.ts`).
 */
const noopAdapter: ValidationAdapter = {
  name: 'noop',
  importStatements: () => [],
  render: () => '',
  renderModule: () => ({ schemaText: '', namedNestedSchemas: new Map(), warnings: [] }),
  inferType: () => 'unknown',
};

export default defineConfig({
  validation: noopAdapter,
  contracts: { glob: 'src/**/*.controller.ts' },
  codegen: { outDir: 'src/generated' },
  // Typed client only (routes.ts + api.ts); no client-side validation schemas.
  forms: { enabled: false },
});
