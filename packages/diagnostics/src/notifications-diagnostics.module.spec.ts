import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Isolate the module's responsibility (resolve EventEmitter2 + attach on init, detach on destroy)
// from the bridge's behavior (covered by attach-notifications-diagnostics.spec.ts). Mocking the
// bridge lets us assert the module calls attach with the container's emitter and calls the returned
// unsubscribe on destroy — without re-testing the emit path.
const { attachSpy, offSpy } = vi.hoisted(() => {
  const offSpy = vi.fn();
  return { offSpy, attachSpy: vi.fn(() => offSpy) };
});
vi.mock('./attach-notifications-diagnostics', () => ({
  attachNotificationsDiagnostics: attachSpy,
}));

import { NotificationsDiagnosticsModule } from './notifications-diagnostics.module';

describe('NotificationsDiagnosticsModule', () => {
  afterEach(() => {
    attachSpy.mockClear();
    offSpy.mockClear();
  });

  it('resolves EventEmitter2 and attaches on init', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), NotificationsDiagnosticsModule.forRoot()],
    }).compile();
    await moduleRef.init();
    try {
      expect(attachSpy).toHaveBeenCalledTimes(1);
      expect(attachSpy).toHaveBeenCalledWith(moduleRef.get(EventEmitter2, { strict: false }));
    } finally {
      await moduleRef.close();
    }
  });

  it('calls the unsubscribe returned by attach on destroy', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), NotificationsDiagnosticsModule.forRoot()],
    }).compile();
    await moduleRef.init();
    expect(offSpy).not.toHaveBeenCalled();
    await moduleRef.close();
    expect(offSpy).toHaveBeenCalledTimes(1);
  });

  it('warns and does not throw when EventEmitterModule is absent', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsDiagnosticsModule.forRoot()],
    }).compile();
    await expect(moduleRef.init()).resolves.toBeDefined();
    expect(attachSpy).not.toHaveBeenCalled();
    await moduleRef.close();
  });
});
