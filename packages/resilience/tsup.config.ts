import { rmSync } from 'node:fs';
import { defineConfig } from 'tsup';

/** Dual ESM + CJS build (mirrors the other channel packages). @nestjs/resilience and
 *  @nestjs/common stay external (peer deps resolved by the consumer). */
const external = ['@nestjs/resilience', '@nestjs/common'];

// tsup builds the entries of a config array concurrently, so a per-entry `clean: true` races the
// other passes and can delete files they already wrote (e.g. `index.d.cts`, seen under a loaded
// `turbo run build`). Clean the output directory once, before any pass starts, and let no entry
// clean. `scripts/check-package-exports.mjs` (prepack) fails the pack if an entry is still missing.
rmSync(new URL('./dist/', import.meta.url), { recursive: true, force: true });

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    external,
  },
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    external,
  },
]);
