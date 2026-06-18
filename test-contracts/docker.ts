import { execSync } from 'node:child_process';

let cached: boolean | undefined;

/**
 * Whether a usable Docker daemon is reachable. The testcontainers DB matrix needs it; without it
 * the `*.db.spec.ts` suites skip gracefully (so `pnpm test:db` is a no-op on machines/CI without
 * Docker rather than a hard failure).
 */
export function isDockerAvailable(): boolean {
  if (cached !== undefined) return cached;
  try {
    execSync('docker info', { stdio: 'ignore' });
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}
