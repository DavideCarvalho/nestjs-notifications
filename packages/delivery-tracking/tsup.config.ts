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

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/mail.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
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
