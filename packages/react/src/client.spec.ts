import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsApiError, NotificationsClient } from './client';
import type { NotificationItem } from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function item(id: string): NotificationItem {
  return {
    id,
    type: 'Test',
    notifiableType: 'User',
    notifiableId: '1',
    tenantId: null,
    data: { title: `t-${id}` },
    readAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NotificationsClient', () => {
  it('normalizes the base url and lists with query params (items shape)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ items: [item('a')], page: 1, perPage: 20, total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new NotificationsClient({ baseUrl: 'https://api.test/inbox' });
    const page = await client.list({ page: 2, perPage: 10 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/inbox/notifications?page=2&perPage=10');
    expect(init.method).toBe('GET');
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it('tolerates a `data` alias in the paginated payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [item('a'), item('b')], page: 1, perPage: 20, total: 2 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new NotificationsClient();
    const page = await client.list();
    expect(page.items.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('reads the unread count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ count: 7 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new NotificationsClient({ baseUrl: '/' });
    await expect(client.unreadCount()).resolves.toBe(7);
    expect(fetchMock.mock.calls[0][0]).toBe('/notifications/unread/count');
  });

  it('encodes ids and posts read / read-all, deletes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(noContent());
    vi.stubGlobal('fetch', fetchMock);

    const client = new NotificationsClient({ baseUrl: '/api' });
    await client.markAsRead('a/b');
    await client.markAllAsRead();
    await client.remove('x y');

    expect(fetchMock.mock.calls[0]).toMatchObject([
      '/api/notifications/a%2Fb/read',
      { method: 'POST' },
    ]);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/notifications/read-all');
    expect(fetchMock.mock.calls[2]).toMatchObject([
      '/api/notifications/x%20y',
      { method: 'DELETE' },
    ]);
  });

  it('sends resolved headers and credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const client = new NotificationsClient({
      headers: () => ({ Authorization: 'Bearer xyz' }),
      credentials: 'include',
    });
    await client.unread();

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer xyz', Accept: 'application/json' });
    expect(init.credentials).toBe('include');
  });

  it('throws NotificationsApiError on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'nope' }, 403));
    vi.stubGlobal('fetch', fetchMock);

    const client = new NotificationsClient();
    await expect(client.unreadCount()).rejects.toBeInstanceOf(NotificationsApiError);
    await expect(client.unreadCount()).rejects.toMatchObject({ status: 403 });
  });

  it('uses an injected fetch over the global', async () => {
    const injected = vi.fn().mockResolvedValue(jsonResponse({ count: 1 }));
    const client = new NotificationsClient({ fetch: injected as unknown as typeof fetch });
    await client.unreadCount();
    expect(injected).toHaveBeenCalledOnce();
  });
});
