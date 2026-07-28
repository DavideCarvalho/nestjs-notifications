import { PATH_METADATA } from '@nestjs/common/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetInboxRegistry } from './inbox-registry';
import type { NotificationsQueryService } from './notifications-query.service';
import { createNotificationsController } from './notifications.controller';

/** Instantiate the generated controller against a stubbed query service. */
function mountController(options?: { path?: string }) {
  const notifications = {
    paginate: vi.fn(async () => ({ items: [], meta: {} })),
    unread: vi.fn(async () => []),
    unreadCount: vi.fn(async () => 0),
    markAsRead: vi.fn(async () => undefined),
    markAllAsRead: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const resolveRef = vi.fn((req: any) => ({ type: 'User', id: String(req.user.id) }));
  const ControllerClass = createNotificationsController({ resolveRef, ...options }) as new (
    service: NotificationsQueryService,
  ) => any;
  return {
    controller: new ControllerClass(notifications as unknown as NotificationsQueryService),
    notifications,
    resolveRef,
    ControllerClass,
  };
}

describe('createNotificationsController', () => {
  beforeEach(() => {
    resetInboxRegistry();
  });

  it('mounts at "notifications" by default', () => {
    const { ControllerClass } = mountController();
    expect(Reflect.getMetadata(PATH_METADATA, ControllerClass)).toBe('notifications');
  });

  it('mounts at a custom path when given one', () => {
    const { ControllerClass } = mountController({ path: 'inbox' });
    expect(Reflect.getMetadata(PATH_METADATA, ControllerClass)).toBe('inbox');
  });

  describe('DELETE /:id', () => {
    it('resolves the caller and scopes the delete to them', async () => {
      // Without the ref, the endpoint deletes any id it is handed, regardless of owner.
      const { controller, notifications, resolveRef } = mountController();
      const req = { user: { id: 42 } };

      await controller.remove(req, 'n1');

      expect(resolveRef).toHaveBeenCalledWith(req);
      expect(notifications.delete).toHaveBeenCalledWith('n1', { type: 'User', id: '42' });
    });

    it('supports an async resolveRef', async () => {
      const resolveRef = vi.fn(async () => ({ type: 'User', id: '7' }));
      const notifications = { delete: vi.fn(async () => undefined) };
      const ControllerClass = createNotificationsController({ resolveRef }) as new (
        service: NotificationsQueryService,
      ) => any;
      const controller = new ControllerClass(notifications as unknown as NotificationsQueryService);

      await controller.remove({}, 'n1');

      expect(notifications.delete).toHaveBeenCalledWith('n1', { type: 'User', id: '7' });
    });
  });

  describe('POST /:id/read', () => {
    it('scopes the read to the resolved caller', async () => {
      const { controller, notifications } = mountController();

      await controller.markAsRead({ user: { id: 42 } }, 'n1');

      expect(notifications.markAsRead).toHaveBeenCalledWith('n1', { type: 'User', id: '42' });
    });
  });
});
