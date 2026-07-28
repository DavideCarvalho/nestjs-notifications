import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseChannelModule } from './database.module';
import { InboxMountAudit } from './inbox-mount-audit';
import { resetInboxRegistry } from './inbox-registry';
import { createNotificationsController } from './notifications.controller';

const resolveRef = (): { type: string; id: string } => ({ type: 'User', id: '1' });

/** Run the audit against whatever is currently in the registry, returning the warning (if any). */
function runAudit(): string | undefined {
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  new InboxMountAudit().onApplicationBootstrap();
  const message = warn.mock.calls[0]?.[0] as string | undefined;
  warn.mockRestore();
  return message;
}

describe('InboxMountAudit', () => {
  beforeEach(() => {
    resetInboxRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when the module auto-mounts AND the app mounts its own controller', () => {
    // Exactly the downstream wiring that shipped the bug: forRoot() without `controller: false`,
    // plus a hand-mounted controller on a different path.
    DatabaseChannelModule.forRoot({});
    createNotificationsController({ resolveRef, path: 'notifications-inbox' });

    const message = runAudit();

    expect(message).toBeDefined();
    expect(message).toContain('"notifications"');
    expect(message).toContain('"notifications-inbox"');
    expect(message).toContain('does NOT disable');
    expect(message).toContain('controller: false');
  });

  it('warns regardless of the order the two mounts were built in', () => {
    // Module metadata evaluation order is not deterministic, which is why the audit runs at
    // bootstrap rather than inside forRoot().
    createNotificationsController({ resolveRef, path: 'notifications-inbox' });
    DatabaseChannelModule.forRoot({});

    expect(runAudit()).toBeDefined();
  });

  it('names both paths when the duplicate collides on the same path', () => {
    DatabaseChannelModule.forRoot({});
    createNotificationsController({ resolveRef });

    expect(runAudit()).toContain('"notifications", and this application also mounted its own at');
  });

  it('stays silent when the app opts out with `controller: false`', () => {
    DatabaseChannelModule.forRoot({ controller: false });
    createNotificationsController({ resolveRef, path: 'notifications-inbox' });

    expect(runAudit()).toBeUndefined();
  });

  it('stays silent for the plain auto-mount with no hand-mounted controller', () => {
    DatabaseChannelModule.forRoot({});

    expect(runAudit()).toBeUndefined();
  });

  it('stays silent when only the app mounts a controller', () => {
    createNotificationsController({ resolveRef });

    expect(runAudit()).toBeUndefined();
  });

  it('reports the count when the app mounts several of its own', () => {
    DatabaseChannelModule.forRoot({});
    createNotificationsController({ resolveRef, path: 'inbox-a' });
    createNotificationsController({ resolveRef, path: 'inbox-b' });

    const message = runAudit();

    expect(message).toContain('2 of its own');
    expect(message).toContain('"inbox-a", "inbox-b"');
  });
});
