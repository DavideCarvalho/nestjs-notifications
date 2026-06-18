import { defineConfig } from 'tsup';

/**
 * Dual ESM + CJS build (mirrors packages/core). Two passes so the CJS pass emits an `index.d.cts`
 * that a `require()` consumer resolves under NodeNext. esbuild honors `emitDecoratorMetadata`
 * from tsconfig, so NestJS DI / ORM `design:paramtypes` metadata survives in both outputs.
 */
const external = [
  '@dudousxd/nestjs-notifications-database',
  '@dudousxd/nestjs-notifications-preferences',
  '@mikro-orm/core',
  '@mikro-orm/decorators',
  '@mikro-orm/nestjs',
  '@nestjs/common',
  'reflect-metadata',
];

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
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
