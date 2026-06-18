import { defineConfig } from 'tsup';

/**
 * Dual ESM + CJS build (mirrors packages/core), with two entry points: the root SDK (`.`) and the
 * TanStack Query factories (`./tanstack`). Two passes so each subpath gets a CJS-flavoured `.d.cts`
 * that a `require()` consumer resolves under NodeNext. Framework-neutral headless SDK — no runtime
 * deps to externalize (TanStack types are type-only).
 */
const entry = ['src/index.ts', 'src/tanstack.ts'];

export default defineConfig([
  {
    entry,
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
  },
  {
    entry,
    format: ['cjs'],
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
  },
]);
