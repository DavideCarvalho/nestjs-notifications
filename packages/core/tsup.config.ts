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
  '@dudousxd/nestjs-context',
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'reflect-metadata',
  'rxjs',
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
