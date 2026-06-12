import { describe, expect, it } from 'vitest';
import { nestjsNotificationsCodegen } from './index';

function run(ext: ReturnType<typeof nestjsNotificationsCodegen>, base: unknown[] = []) {
  // transformRoutes appends to whatever the core discovered.
  return (ext.transformRoutes?.(base as never, {} as never) ?? base) as Array<{
    method: string;
    path: string;
    name: string;
    params: Array<{ name: string }>;
    contract?: { contractSource: { query: string | null; body: string | null; response: string } };
  }>;
}

describe('nestjsNotificationsCodegen', () => {
  it('injects the inbox routes by default and preserves existing ones', () => {
    const existing = [{ method: 'GET', path: '/x', name: 'x', params: [] }];
    const routes = run(nestjsNotificationsCodegen(), existing);
    const names = routes.map((r) => r.name);
    expect(names).toContain('x'); // existing kept
    expect(names).toEqual(
      expect.arrayContaining([
        'notifications.list',
        'notifications.unread',
        'notifications.unreadCount',
        'notifications.markAsRead',
        'notifications.markAllAsRead',
        'notifications.remove',
      ]),
    );
  });

  it('list returns the paginated shape and accepts page/perPage query', () => {
    const routes = run(nestjsNotificationsCodegen());
    const list = routes.find((r) => r.name === 'notifications.list');
    expect(list?.method).toBe('GET');
    expect(list?.path).toBe('/notifications');
    expect(list?.contract?.contractSource.query).toContain('page?: number');
    expect(list?.contract?.contractSource.response).toContain('items:');
    // `meta` + `lastPage` so the generated infiniteQueryOptions can paginate.
    expect(list?.contract?.contractSource.response).toContain('lastPage');
  });

  it('markAsRead is POST /notifications/:id/read with a path param', () => {
    const routes = run(nestjsNotificationsCodegen());
    const read = routes.find((r) => r.name === 'notifications.markAsRead');
    expect(read?.method).toBe('POST');
    expect(read?.path).toBe('/notifications/:id/read');
    expect(read?.params).toEqual([{ name: 'id', source: 'path' }]);
  });

  it('honors basePath and a custom name namespace', () => {
    const routes = run(nestjsNotificationsCodegen({ basePath: '/api', name: 'inbox' }));
    const list = routes.find((r) => r.name === 'inbox.list');
    expect(list?.path).toBe('/api/notifications');
  });

  it('honors a custom path while keeping the name namespace', () => {
    const routes = run(nestjsNotificationsCodegen({ path: 'notifications-inbox' }));
    const list = routes.find((r) => r.name === 'notifications.list');
    const unread = routes.find((r) => r.name === 'notifications.unread');
    expect(list?.path).toBe('/notifications-inbox');
    expect(unread?.path).toBe('/notifications-inbox/unread');
  });

  it('emits preference routes only when enabled', () => {
    expect(run(nestjsNotificationsCodegen()).some((r) => r.name.includes('preferences'))).toBe(
      false,
    );
    const withPrefs = run(nestjsNotificationsCodegen({ preferences: true }));
    expect(withPrefs.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        'notifications.preferences.categories',
        'notifications.preferences.setChannel',
        'notifications.preferences.setDigest',
      ]),
    );
  });
});
