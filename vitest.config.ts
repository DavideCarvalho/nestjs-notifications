import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { workspaceSourceAliases } from './vitest.aliases';

export default defineConfig({
  resolve: {
    alias: workspaceSourceAliases(),
  },
  plugins: [
    // Emit `emitDecoratorMetadata` so NestJS DI works under Vitest (esbuild can't do it).
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/src/**/*.{test,spec}.ts', 'examples/*/src/**/*.{test,spec}.ts'],
    // `*.db.spec.ts` are the testcontainers Postgres/MySQL matrix — slow and Docker-gated. They run
    // only via `pnpm test:db` (vitest.db.config.ts), keeping the default `pnpm test` fast + green.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.db.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.{test,spec}.ts', 'packages/*/src/index.ts'],
    },
  },
});
