/** SSE event name carrying cross-device read-sync payloads (mirrors the SSE package). */
export const READ_EVENT = 'read';

/** Payload of a cross-device read event (`event: read`). `notificationId` is null for "all read". */
export interface ReadSyncEvent {
  notificationId: string | null;
  readAt: string;
}

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
   *
   * Note: a cross-device read event (`event: read`) does NOT trigger `onUpdate` — handle it via
   * {@link onRead} instead, so reading on one device patches the inbox in place rather than
   * forcing a refetch.
   */
  onUpdate: () => void;
  /**
   * Called when another device marks a notification (or all) as read — the cross-device read sync
   * signal. Apply it to your local inbox state (mark the matching item read). `notificationId` is
   * `null` for a "mark all read" event.
   */
  onRead?: (event: ReadSyncEvent) => void;
  /** fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch | undefined;
  /** Forwarded to `fetch`; set `'same-origin'`/`'omit'` to change cookie behavior. Default `'include'`. */
  credentials?: RequestCredentials | undefined;
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
    onRead,
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
        await readFrames(response.body, (frame) => {
          if (cancelled) return;
          if (frame.type === 'read') {
            if (frame.read) onRead?.(frame.read);
            return;
          }
          onUpdate();
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

/** A parsed SSE frame, classified for the subscriber. */
interface ParsedFrame {
  /** `'read'` for a cross-device read event, else `'push'` for a generic change signal. */
  type: 'read' | 'push';
  /** The read payload, when `type` is `'read'` and the JSON parsed. */
  read?: ReadSyncEvent;
}

/** Read an SSE body stream, firing `onFrame` once per non-heartbeat frame. */
async function readFrames(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: ParsedFrame) => void,
): Promise<void> {
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
      const parsed = parseFrame(frame);
      if (parsed) onFrame(parsed);
    }
  }
}

/**
 * Classify an SSE frame. Returns `null` for heartbeats and empty frames. A `read` event carries a
 * JSON `data:` payload; any other non-empty-data frame is a generic `push` signal (unchanged).
 */
function parseFrame(frame: string): ParsedFrame | null {
  let event: string | undefined;
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim();
    }
  }
  if (event === 'heartbeat') return null;
  if (data.length === 0) return null;
  if (event === READ_EVENT) {
    const read = parseReadPayload(data);
    // Omit `read` when the payload was malformed (exactOptionalPropertyTypes); the consumer
    // already guards with `if (frame.read)`, so an absent field behaves identically.
    return read === undefined ? { type: 'read' } : { type: 'read', read };
  }
  return { type: 'push' };
}

/** Parse a read-event JSON payload defensively; returns undefined when malformed. */
function parseReadPayload(data: string): ReadSyncEvent | undefined {
  try {
    const obj = JSON.parse(data) as Partial<ReadSyncEvent>;
    if (typeof obj.readAt !== 'string') return undefined;
    return {
      notificationId: typeof obj.notificationId === 'string' ? obj.notificationId : null,
      readAt: obj.readAt,
    };
  } catch {
    return undefined;
  }
}
