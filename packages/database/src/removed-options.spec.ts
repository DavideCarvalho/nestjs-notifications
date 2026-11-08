import { describe, expect, it } from 'vitest';
import { DatabaseChannelModule } from './database.module';
import { createNotificationsController } from './notifications.controller';

/**
 * Removed options must not silently weaken who reaches the routes for a JavaScript caller (no type
 * checker): they throw with a pointer to the replacement instead of being ignored.
 */
describe('removed route-protection options', () => {
  const resolveRef = () => ({ type: 'User', id: '1' });

  it.each([false, true])('forRoot/forFeature refuse `controller: %s`', (value) => {
    expect(() => DatabaseChannelModule.forRoot({ controller: value as any })).toThrow(
      /routes: false/,
    );
    expect(() => DatabaseChannelModule.forFeature({ controller: value as any })).toThrow(
      /routes: false/,
    );
  });

  it('forRoot/forFeature refuse `controller.guards`, even under `routes: false`', () => {
    const controller = { resolveRef, guards: [] } as any;
    expect(() => DatabaseChannelModule.forRoot({ controller })).toThrow(/decorators/);
    expect(() => DatabaseChannelModule.forFeature({ controller, routes: false })).toThrow(
      /decorators/,
    );
  });

  it('createNotificationsController refuses `guards`', () => {
    expect(() => createNotificationsController({ resolveRef, guards: [] } as any)).toThrow(
      /createNotificationsController\(\): the `guards` option was removed.*decorators/,
    );
  });

  it('still accepts the current options', () => {
    expect(() =>
      DatabaseChannelModule.forRoot({ controller: { resolveRef, path: 'inbox-ok' } }),
    ).not.toThrow();
    expect(() => DatabaseChannelModule.forFeature({ routes: false })).not.toThrow();
  });
});
