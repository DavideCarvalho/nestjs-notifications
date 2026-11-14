import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsApiError, createNotificationsClient } from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('NotificationsClient', () => {
  it('lists notifications with pagination params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ id: '1' }],
        meta: { total: 11, perPage: 10, currentPage: 2, lastPage: 2, firstPage: 1 },
      }),
    );
    const client = createNotificationsClient({ baseUrl: 'https://api.test', fetch: fetchMock });

    const page = await client.list({ page: 2, size: 10 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/notifications?page=2&size=10');
    expect(page).toEqual({
      data: [{ id: '1' }],
      meta: { total: 11, perPage: 10, currentPage: 2, lastPage: 2, firstPage: 1 },
    });
  });

  it('targets a custom resource path', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          data: [],
          meta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1, firstPage: 1 },
        }),
      ),
    );
    const client = createNotificationsClient({
      baseUrl: 'https://api.test',
      path: 'notifications-inbox',
      fetch: fetchMock,
    });

    await client.list();
    await client.unread();
    await client.markAllAsRead();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/notifications-inbox');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.test/notifications-inbox/unread');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://api.test/notifications-inbox/read-all');
  });

  it('unwraps the `{ data }` of the unread list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'u1' }] }));
    const client = createNotificationsClient({ fetch: fetchMock });
    expect(await client.unread()).toEqual([{ id: 'u1' }]);
  });

  it('reads the unread count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ count: 7 }));
    const client = createNotificationsClient({ fetch: fetchMock });
    expect(await client.unreadCount()).toBe(7);
  });

  it('sends the types filter as a `filter[type]` comma list', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          data: [],
          meta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1, firstPage: 1 },
        }),
      ),
    );
    const client = createNotificationsClient({ baseUrl: 'https://api.test', fetch: fetchMock });

    await client.list({ types: ['A', 'B'] });
    await client.unread({ types: ['A', 'B'] });
    await client.unreadCount({ types: ['A', 'B'] });
    // An empty array omits the param entirely (no filter).
    await client.unread({ types: [] });

    const filter = 'filter%5Btype%5D=A%2CB';
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://api.test/notifications?${filter}`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`https://api.test/notifications/unread?${filter}`);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `https://api.test/notifications/unread/count?${filter}`,
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://api.test/notifications/unread');
  });

  it('posts mark-as-read for an id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, 204));
    const client = createNotificationsClient({ baseUrl: '/', fetch: fetchMock });
    await client.markAsRead('abc');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/notifications/abc/read');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('throws NotificationsApiError on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const client = createNotificationsClient({ fetch: fetchMock });
    await expect(client.unread()).rejects.toBeInstanceOf(NotificationsApiError);
  });

  it('subscribe is a no-op without EventSource or sseUrl', () => {
    const client = createNotificationsClient({ fetch: vi.fn() });
    expect(client.subscribe(() => {})()).toBeUndefined(); // returns a callable no-op
  });

  it('subscribe delivers the count from a `notification` event and closes on unsubscribe', () => {
    const listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
    const close = vi.fn();
    class FakeEventSource {
      constructor(
        public url: string,
        public init?: { withCredentials?: boolean },
      ) {}
      addEventListener(type: string, cb: (e: MessageEvent) => void) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(cb);
      }
      removeEventListener() {}
      close = close;
    }
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);

    const client = createNotificationsClient({ sseUrl: '/stream', fetch: vi.fn() });
    const received: Array<{ count?: number }> = [];
    const unsubscribe = client.subscribe((e) => received.push(e));

    for (const cb of listeners.notification ?? []) {
      cb({ data: JSON.stringify({ count: 3 }) } as MessageEvent);
    }
    expect(received).toEqual([{ count: 3 }]);

    unsubscribe();
    expect(close).toHaveBeenCalledOnce();
  });
});
