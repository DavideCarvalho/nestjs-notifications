/**
 * Options for {@link subscribeNotificationsStream}.
 *
 * The `headers` shape intentionally mirrors a fetch-client's dynamic-headers option
 * (`() => Record<string, string>`), so you can pass the very same auth function you give your
 * HTTP client and configure credentials once.
 */
export interface NotificationsStreamOptions {
  /** URL of the SSE stream endpoint, e.g. `/api/notifications/stream`. */
  url: string;
  /**
   * Called whenever the server pushes a change. There's no payload by design — the SSE channel
   * only signals "your notifications changed"; refetch your inbox/unread queries here.
   */
  onUpdate: () => void;
  /** fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Forwarded to `fetch`; set `'same-origin'`/`'omit'` to change cookie behavior. Default `'include'`. */
  credentials?: RequestCredentials;
  /** Dynamic request headers (e.g. a bearer token), evaluated on every (re)connect. */
  headers?: () => Record<string, string>;
  /** Invoked when a connection attempt fails or drops, before the reconnect backoff. */
  onError?: (err: unknown) => void;
  /** First reconnect delay; doubles up to {@link maxRetryDelayMs}. Default 1000ms. */
  initialRetryDelayMs?: number;
  /** Reconnect backoff ceiling. Default 30000ms. */
  maxRetryDelayMs?: number;
}

/**
 * Subscribe to the notifications SSE stream and call `onUpdate` on every server push.
 *
 * Uses `fetch` (not `EventSource`) so requests can carry an `Authorization` header — `EventSource`
 * cannot set headers. Parses SSE frames, ignores heartbeats, and reconnects with exponential
 * backoff. Returns an unsubscribe function that aborts the connection and stops retrying.
 *
 * Framework-agnostic on purpose — no React, no query library. Wrap it for your stack (see
 * `useNotificationsStream` in `@dudousxd/nestjs-notifications-react`).
 *
 * ```ts
 * const stop = subscribeNotificationsStream({
 *   url: '/api/notifications/stream',
 *   headers: () => ({ Authorization: `Bearer ${getToken()}` }),
 *   onUpdate: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
 * });
 * // later: stop();
 * ```
 */
export function subscribeNotificationsStream(options: NotificationsStreamOptions): () => void {
  const {
    url,
    onUpdate,
    headers,
    onError,
    credentials = 'include',
    initialRetryDelayMs = 1_000,
    maxRetryDelayMs = 30_000,
  } = options;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  let cancelled = false;
  let abort: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function run(): Promise<void> {
    let retryDelayMs = initialRetryDelayMs;
    while (!cancelled) {
      abort = new AbortController();
      try {
        if (!fetchImpl) {
          throw new Error('No fetch implementation: pass options.fetch or set globalThis.fetch');
        }
        const response = await fetchImpl(url, {
          headers: { Accept: 'text/event-stream', ...headers?.() },
          credentials,
          signal: abort.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`notifications stream HTTP ${response.status}`);
        }
        retryDelayMs = initialRetryDelayMs; // connected — reset the backoff
        await readFrames(response.body, () => {
          if (!cancelled) onUpdate();
        });
      } catch (err) {
        if (!cancelled) onError?.(err);
      }
      if (cancelled) return;
      await sleep(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      retryTimer = setTimeout(resolve, ms);
    });
  }

  void run();

  return () => {
    cancelled = true;
    abort?.abort();
    if (retryTimer) clearTimeout(retryTimer);
  };
}

/** Read an SSE body stream, firing `onPush` once per non-heartbeat frame. */
async function readFrames(body: ReadableStream<Uint8Array>, onPush: () => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; keep the trailing partial frame buffered.
    const frames = buffered.split('\n\n');
    buffered = frames.pop() ?? '';
    for (const frame of frames) {
      if (isPushFrame(frame)) onPush();
    }
  }
}

/**
 * A "real" push: carries a non-empty `data:` payload and isn't the keep-alive heartbeat (which the
 * stream sends as `event: heartbeat` with an empty data line).
 */
function isPushFrame(frame: string): boolean {
  let isHeartbeat = false;
  let hasData = false;
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      if (line.slice('event:'.length).trim() === 'heartbeat') isHeartbeat = true;
    } else if (line.startsWith('data:')) {
      if (line.slice('data:'.length).trim().length > 0) hasData = true;
    }
  }
  return hasData && !isHeartbeat;
}
