import { defineConfig } from 'tsup';

/**
 * Dual ESM + CJS build (mirrors packages/core). Two passes so the CJS pass emits an `index.d.cts`
 * that a `require()` consumer resolves under NodeNext. esbuild honors `emitDecoratorMetadata`
 * from tsconfig, so NestJS DI / ORM `design:paramtypes` metadata survives in both outputs.
 */
const external = [
  '@dudousxd/nestjs-notifications-client',
  'react',
  'react-dom',
  'reflect-metadata',
];

// tsup/esbuild compiles our JSX with the CLASSIC runtime (`React.createElement`) and overrides the
// `jsx` esbuild option after `esbuildOptions`, so we can't switch to the automatic runtime from here.
// Inject a React shim instead: esbuild rewrites every unbound `React` reference to an import from the
// (externalized) peer `react`, so the published bundle is self-contained rather than relying on a
// `React` global — which is undefined in a modern automatic-runtime consumer bundle and caused
// "React is not defined" at module load.
const inject = ['react-shim.ts'];

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
    inject,
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
    inject,
  },
]);
