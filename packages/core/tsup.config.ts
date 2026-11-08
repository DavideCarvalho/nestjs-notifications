import { rmSync } from 'node:fs';
import { defineConfig } from 'tsup';

/**
 * Dual ESM + CJS build (ecosystem standard — mirrors nestjs-codegen / nestjs-inertia).
 *
 * Two passes so the CJS pass emits a CJS-flavoured declaration (`index.d.cts`): under NodeNext a
 * consumer's `require()` then resolves declarations that match the CommonJS output rather than the
 * ESM `index.d.ts`. esbuild honors `emitDecoratorMetadata` from tsconfig, so NestJS DI
 * (`design:paramtypes`) metadata survives in both outputs.
 *
 * All runtime peers are external — they must never be bundled into the published artifact.
 */
const external = [
  '@nestjs/outbox',
  '@nestjs/i18n',
  '@dudousxd/nestjs-context',
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'reflect-metadata',
  'rxjs',
];

// tsup builds the entries of a config array concurrently, so a per-entry `clean: true` races the
// other passes and can delete files they already wrote (e.g. `index.d.cts`, seen under a loaded
// `turbo run build`). Clean the output directory once, before any pass starts, and let no entry
// clean. `scripts/check-package-exports.mjs` (prepack) fails the pack if an entry is still missing.
rmSync(new URL('./dist/', import.meta.url), { recursive: true, force: true });

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/outbox.ts', 'src/i18n.ts'],
    format: ['esm'],
    dts: true,
    clean: false,
    // Subpath entries share chunks with the main entry, so DI tokens (classes, symbols) are
    // the same objects whichever entry a consumer imports.
    splitting: true,
    sourcemap: true,
    outDir: 'dist',
    external,
  },
  {
    entry: ['src/index.ts', 'src/outbox.ts', 'src/i18n.ts'],
    format: ['cjs'],
    dts: true,
    clean: false,
    // Subpath entries share chunks with the main entry, so DI tokens (classes, symbols) are
    // the same objects whichever entry a consumer imports.
    splitting: true,
    sourcemap: true,
    outDir: 'dist',
    external,
  },
]);
