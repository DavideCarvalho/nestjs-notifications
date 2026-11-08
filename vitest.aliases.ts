import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AliasOptions } from 'vite';

/**
 * Resolve every workspace package (`@dudousxd/nestjs-notifications-*`) to its `src/index.ts` so tests
 * run against source, as a single instance — independent of each package's published build format.
 *
 * Required now that `core` publishes dual ESM+CJS (ecosystem standard): without it, an ESM consumer
 * and a CJS consumer would load two different built copies of `core`, splitting its reflect-metadata
 * / DI registries and breaking decorator-driven fan-out. Exact-match (anchored) regexes avoid prefix
 * collisions (e.g. `-database` swallowing `-database-typeorm`).
 */
export function workspaceSourceAliases(): AliasOptions {
  const packagesDir = fileURLToPath(new URL('./packages', import.meta.url));
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      const dir = e.name;
      const { name, exports } = JSON.parse(
        readFileSync(new URL(`./packages/${dir}/package.json`, import.meta.url), 'utf8'),
      ) as { name: string; exports?: Record<string, unknown> };
      // Subpath exports (`./outbox` → `src/outbox.ts`) first, then the main entry.
      const subpaths = Object.keys(exports ?? {}).filter(
        (key) => key !== '.' && key.startsWith('./'),
      );
      return [...subpaths.map((key) => key.slice(2)), ''].map((sub) => ({
        find: new RegExp(`^${escapeRegExp(sub ? `${name}/${sub}` : name)}$`),
        replacement: fileURLToPath(
          new URL(`./packages/${dir}/src/${sub || 'index'}.ts`, import.meta.url),
        ),
      }));
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
