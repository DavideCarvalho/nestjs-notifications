/**
 * Tracks every inbox controller class built in this process so {@link InboxMountAudit} can tell,
 * at bootstrap, whether an app both let `DatabaseChannelModule` auto-mount the inbox AND mounted
 * its own via `createNotificationsController()`. Mounting your own does not disable the auto-mount,
 * and until the audit warns about it the duplicate is completely silent.
 *
 * Internal to the package — not re-exported from `index.ts`.
 */

/** How an inbox controller came to exist: auto-mounted by the module, or built by the app. */
export type InboxMountOrigin = 'auto' | 'manual';

/** One inbox controller class built in this process. */
export interface MountedInbox {
  /** Base path the controller is mounted at (the resolved `@Controller()` argument). */
  path: string;
  origin: InboxMountOrigin;
}

const mounts: MountedInbox[] = [];

/** Record a freshly built inbox controller. Called from the controller factory. */
export function recordInboxMount(mount: MountedInbox): void {
  mounts.push(mount);
}

/** Every inbox controller built so far, in build order. */
export function mountedInboxes(): readonly MountedInbox[] {
  return mounts;
}

/** Clear the registry. Tests only — a real process builds its controllers once, at startup. */
export function resetInboxRegistry(): void {
  mounts.length = 0;
}
