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
        items: [{ id: '1' }],
        meta: { page: 2, perPage: 10, total: 11, lastPage: 2 },
      }),
    );
    const client = createNotificationsClient({ baseUrl: 'https://api.test', fetch: fetchMock });

    const page = await client.list({ page: 2, perPage: 10 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/notifications?page=2&perPage=10');
    expect(page).toEqual({
      items: [{ id: '1' }],
      meta: { page: 2, perPage: 10, total: 11, lastPage: 2 },
    });
  });

  it('reads the unread count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ count: 7 }));
    const client = createNotificationsClient({ fetch: fetchMock });
    expect(await client.unreadCount()).toBe(7);
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
