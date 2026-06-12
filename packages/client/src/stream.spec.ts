import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeNotificationsStream } from './stream';

/** Build a `Response` whose body streams the given SSE chunks, then closes. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** A response body that never closes, so the read loop stays open until aborted. */
function openSseResponse(signal: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener('abort', () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('subscribeNotificationsStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onUpdate once per real push frame', async () => {
    const onUpdate = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"type":"notifications-updated"}\n\n',
          'data: {"type":"notifications-updated"}\n\n',
        ]),
      );

    const stop = subscribeNotificationsStream({
      url: 'https://api.test/notifications/stream',
      fetch: fetchMock as unknown as typeof fetch,
      onUpdate,
      maxRetryDelayMs: 5,
      initialRetryDelayMs: 5,
    });
    await flush();
    stop();

    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('ignores heartbeat frames', async () => {
    const onUpdate = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: heartbeat\ndata: \n\n',
          'data: {"type":"notifications-updated"}\n\n',
          'event: heartbeat\ndata: \n\n',
        ]),
      );

    const stop = subscribeNotificationsStream({
      url: 'https://api.test/notifications/stream',
      fetch: fetchMock as unknown as typeof fetch,
      onUpdate,
      initialRetryDelayMs: 5,
      maxRetryDelayMs: 5,
    });
    await flush();
    stop();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('handles a frame split across chunks', async () => {
    const onUpdate = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(['data: {"type":"notifi', 'cations-updated"}\n\n']));

    const stop = subscribeNotificationsStream({
      url: 'https://api.test/notifications/stream',
      fetch: fetchMock as unknown as typeof fetch,
      onUpdate,
      initialRetryDelayMs: 5,
      maxRetryDelayMs: 5,
    });
    await flush();
    stop();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('passes dynamic headers and Accept on each connect', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return Promise.resolve(openSseResponse(init?.signal as AbortSignal));
    });

    const stop = subscribeNotificationsStream({
      url: 'https://api.test/notifications/stream',
      fetch: fetchMock as unknown as typeof fetch,
      onUpdate: vi.fn(),
      headers: () => ({ Authorization: 'Bearer tok' }),
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers.Accept).toBe('text/event-stream');
    expect(init.credentials).toBe('include'); // default

    stop();
  });

  it('forwards a custom credentials mode', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(openSseResponse(init?.signal as AbortSignal)),
    );

    const stop = subscribeNotificationsStream({
      url: 'https://api.test/notifications/stream',
      fetch: fetchMock as unknown as typeof fetch,
      onUpdate: vi.fn(),
      credentials: 'omit',
    });
    await flush();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('omit');

    stop();
  });

  it('reconnects with backoff after a failed connect', async () => {
    const onError = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValue(sseResponse(['data: {"type":"notifications-updated"}\n\n']));

    const stop = subscribeNotificationsStream({
      url: 'https://api.test/notifications/stream',
      fetch: fetchMock as unknown as typeof fetch,
      onUpdate: vi.fn(),
      onError,
      initialRetryDelayMs: 1,
      maxRetryDelayMs: 1,
    });
    // First attempt fails (500) → onError → backoff → second attempt succeeds.
    await new Promise((resolve) => setTimeout(resolve, 10));
    stop();

    expect(onError).toHaveBeenCalled();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('stops fetching after unsubscribe', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(openSseResponse(init?.signal as AbortSignal)),
    );

    const stop = subscribeNotificationsStream({
      url: 'https://api.test/notifications/stream',
      fetch: fetchMock as unknown as typeof fetch,
      onUpdate: vi.fn(),
      initialRetryDelayMs: 1,
      maxRetryDelayMs: 1,
    });
    await flush();
    stop();
    const callsAfterStop = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fetchMock.mock.calls.length).toBe(callsAfterStop);
  });
});
