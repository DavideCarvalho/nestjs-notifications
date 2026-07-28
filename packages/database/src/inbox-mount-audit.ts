import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type MountedInbox, mountedInboxes } from './inbox-registry';

/**
 * Warns at bootstrap when the inbox is mounted twice — once auto-mounted by
 * `DatabaseChannelModule.forRoot()`/`forFeature()` and once by the application via
 * `createNotificationsController()`.
 *
 * `controller` defaults to **true**, so passing your own controller does NOT replace the
 * auto-mounted one: both are live, the auto-mounted one carrying whatever `resolveRef` and guards
 * were configured on the module (by default, none). Apps have shipped believing the opposite, with
 * the auto-mounted duplicate shadowing an unrelated page route on the default `notifications` path.
 *
 * Runs at `onApplicationBootstrap` rather than inside `forRoot()` because module metadata is
 * evaluated in a non-deterministic order — a controller the app builds in a feature module may not
 * exist yet when a global module's `forRoot()` runs. By bootstrap every factory has run.
 *
 * Warns rather than throws: Nest's HMR can re-evaluate module metadata inside one process and
 * produce a duplicate record that is not a real duplicate mount. A false positive should not take a
 * dev server down.
 */
@Injectable()
export class InboxMountAudit implements OnApplicationBootstrap {
  private readonly logger = new Logger('Notifications');

  onApplicationBootstrap(): void {
    const mounts = mountedInboxes();
    const auto = mounts.filter((mount) => mount.origin === 'auto');
    const manual = mounts.filter((mount) => mount.origin === 'manual');
    if (auto.length === 0 || manual.length === 0) return;

    this.logger.warn(
      [
        `DatabaseChannelModule auto-mounted the inbox controller at ${paths(auto)},`,
        `and this application also mounted ${count(manual)} at ${paths(manual)}`,
        'via createNotificationsController(). Mounting your own does NOT disable the',
        'auto-mounted one — both are live, and the auto-mounted one uses whatever resolveRef',
        'and guards were passed to the module (by default, the req.user resolver and no guards).',
        'Pass `controller: false` to DatabaseChannelModule.forRoot()/forFeature() to disable',
        'the auto-mount.',
      ].join(' '),
    );
  }
}

/** `"a"`, or `"a", "b"` — every path, so a same-path collision is visible in the message. */
function paths(mounts: MountedInbox[]): string {
  return mounts.map((mount) => `"${mount.path}"`).join(', ');
}

function count(mounts: MountedInbox[]): string {
  return mounts.length === 1 ? 'its own' : `${mounts.length} of its own`;
}
