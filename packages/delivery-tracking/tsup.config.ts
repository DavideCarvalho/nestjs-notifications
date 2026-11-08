import { rmSync } from 'node:fs';
import { defineConfig } from 'tsup';

/**
 * Dual ESM + CJS build (mirrors packages/core). Two passes so the CJS pass emits an `index.d.cts`
 * that a `require()` consumer resolves under NodeNext. esbuild honors `emitDecoratorMetadata`
 * from tsconfig, so NestJS DI / ORM `design:paramtypes` metadata survives in both outputs.
 */
const external = [
  '@nestjs/mail',
  '@dudousxd/nestjs-notifications-mail',
  '@dudousxd/nestjs-notifications-core',
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'reflect-metadata',
];

// tsup builds the entries of a config array concurrently, so a per-entry `clean: true` races the
// other passes and can delete files they already wrote (e.g. `index.d.cts`, seen under a loaded
// `turbo run build`). Clean the output directory once, before any pass starts, and let no entry
// clean. `scripts/check-package-exports.mjs` (prepack) fails the pack if an entry is still missing.
rmSync(new URL('./dist/', import.meta.url), { recursive: true, force: true });

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/mail.ts'],
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
    entry: ['src/index.ts', 'src/mail.ts'],
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
