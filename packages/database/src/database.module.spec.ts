import { PATH_METADATA } from '@nestjs/common/constants';
import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseChannelModule } from './database.module';
import { InboxMountAudit } from './inbox-mount-audit';
import { resetInboxRegistry } from './inbox-registry';

/**
 * The controllers a `forRoot()`/`forFeature()` call mounts, by their `@Controller()` base path.
 * Reading `PATH_METADATA` off the returned classes needs no Nest bootstrap.
 */
function mountedPaths(module: { controllers?: unknown[] }): string[] {
  return (module.controllers ?? []).map((controller) =>
    Reflect.getMetadata(PATH_METADATA, controller as object),
  );
}

describe('DatabaseChannelModule inbox controller mounting', () => {
  beforeEach(() => {
    resetInboxRegistry();
  });

  describe('forRoot()', () => {
    it('auto-mounts the inbox at "notifications" when `controller` is omitted', () => {
      // The crux of the downstream bug: omitting the option is NOT the same as disabling it.
      const module = DatabaseChannelModule.forRoot({ autoCreateSchema: false });
      expect(mountedPaths(module)).toEqual(['notifications']);
    });

    it('auto-mounts when `controller` is true', () => {
      const module = DatabaseChannelModule.forRoot({ controller: true });
      expect(mountedPaths(module)).toEqual(['notifications']);
    });

    it('mounts nothing when `controller` is false', () => {
      const module = DatabaseChannelModule.forRoot({ controller: false });
      expect(mountedPaths(module)).toEqual([]);
    });

    it('honors a custom path', () => {
      const module = DatabaseChannelModule.forRoot({ controller: { path: 'inbox' } });
      expect(mountedPaths(module)).toEqual(['inbox']);
    });

    it('auto-mounts at the default path when the options object omits `path`', () => {
      // Passing `{ guards }` to configure the controller still leaves it on `notifications`,
      // where it can shadow an application page route.
      const module = DatabaseChannelModule.forRoot({
        controller: { resolveRef: () => ({ type: 'User', id: '1' }) },
      });
      expect(mountedPaths(module)).toEqual(['notifications']);
    });

    it('registers the mount audit so a duplicate mount is reported at bootstrap', () => {
      const module = DatabaseChannelModule.forRoot({});
      expect(module.providers).toContain(InboxMountAudit);
    });
  });

  describe('forFeature()', () => {
    it('auto-mounts the inbox when `controller` is omitted', () => {
      const module = DatabaseChannelModule.forFeature();
      expect(mountedPaths(module)).toEqual(['notifications']);
    });

    it('mounts nothing when `controller` is false', () => {
      const module = DatabaseChannelModule.forFeature({ controller: false });
      expect(mountedPaths(module)).toEqual([]);
    });

    it('registers the mount audit', () => {
      const module = DatabaseChannelModule.forFeature();
      expect(module.providers).toContain(InboxMountAudit);
    });
  });
});
