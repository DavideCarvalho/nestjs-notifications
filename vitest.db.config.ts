import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { workspaceSourceAliases } from './vitest.aliases';

/**
 * The real-engine test matrix: runs the shared store contracts against Postgres + MySQL spun up
 * with testcontainers. Separate from the default config so `pnpm test` stays fast and Docker-free;
 * this one is invoked by `pnpm test:db`. Suites skip gracefully when Docker is unavailable.
 */
export default defineConfig({
  resolve: {
    alias: workspaceSourceAliases(),
  },
  plugins: [
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
    include: ['packages/*/src/**/*.db.spec.ts'],
    // Pulling images + booting a database is slow; give containers room on a cold cache.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // One container set per file — don't run DB files in parallel and contend for Docker/ports.
    fileParallelism: false,
  },
});
