import { rmSync } from 'node:fs';
import { defineConfig } from 'tsup';

/**
 * Dual ESM + CJS build (mirrors packages/core), with two entry points: the root SDK (`.`) and the
 * TanStack Query factories (`./tanstack`). Two passes so each subpath gets a CJS-flavoured `.d.cts`
 * that a `require()` consumer resolves under NodeNext. Framework-neutral headless SDK — no runtime
 * deps to externalize (TanStack types are type-only).
 */
const entry = ['src/index.ts', 'src/tanstack.ts'];

// tsup builds the entries of a config array concurrently, so a per-entry `clean: true` races the
// other passes and can delete files they already wrote (e.g. `index.d.cts`, seen under a loaded
// `turbo run build`). Clean the output directory once, before any pass starts, and let no entry
// clean. `scripts/check-package-exports.mjs` (prepack) fails the pack if an entry is still missing.
rmSync(new URL('./dist/', import.meta.url), { recursive: true, force: true });

export default defineConfig([
  {
    entry,
    format: ['esm'],
    dts: true,
    clean: false,
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
