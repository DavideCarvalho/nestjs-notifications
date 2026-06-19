import { defineConfig } from 'tsup';

/** Dual ESM + CJS build (mirrors the other channel packages). @dudousxd/nestjs-resilience and
 *  @nestjs/common stay external (peer deps resolved by the consumer). */
const external = ['@dudousxd/nestjs-resilience', '@nestjs/common'];

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
