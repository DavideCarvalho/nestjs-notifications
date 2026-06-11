import type { NotificationsClient } from '@dudousxd/nestjs-notifications-client';
import type { NotificationsClientOptions } from '@dudousxd/nestjs-notifications-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useResolvedContext } from './use-notifications-provider';

/** Options for {@link useUnreadCount}. */
export interface UseUnreadCountOptions {
  /** Explicit client (overrides the provider). */
  client?: NotificationsClient;
  /** Build a client inline (overrides the provider). */
  clientOptions?: NotificationsClientOptions;
  /**
   * SSE endpoint to subscribe to (overrides the provider's `sseUrl`). When set
   * and `EventSource` is available, the count refreshes on every message.
   */
  sseUrl?: string;
  /**
   * Poll interval (ms) used when no SSE URL is available, or as a backstop. Set
   * to `0` to disable polling. Default `30000`. When SSE is connected, polling
   * is skipped unless you keep it as a safety net.
   */
  pollIntervalMs?: number;
  /**
   * `withCredentials` for the `EventSource` (sends cookies cross-origin).
   * Mirrors the client's `credentials: 'include'`.
   */
  withCredentials?: boolean;
}

/** Return value of {@link useUnreadCount}. */
export interface UseUnreadCountResult {
  count: number;
  /** Re-fetch the count from the API immediately. */
  refresh: () => Promise<void>;
}

/** True when running in a browser with `EventSource` support. */
function hasEventSource(): boolean {
  return typeof window !== 'undefined' && typeof EventSource !== 'undefined';
}

/**
 * Tracks the unread-notifications count. Subscribes to the SSE stream (if a
 * `sseUrl` is configured and `EventSource` exists) and refreshes on each push;
 * otherwise polls `pollIntervalMs`. SSR-safe — the `EventSource` is only
 * created inside `useEffect`, guarded on `typeof window`, and torn down on
 * unmount.
 *
 * ```tsx
 * const { count } = useUnreadCount({ sseUrl: '/api/notifications/stream' });
 * ```
 */
export function useUnreadCount(options: UseUnreadCountOptions = {}): UseUnreadCountResult {
  const { client, sseUrl: ctxSseUrl } = useResolvedContext(options);
  const sseUrl = options.sseUrl ?? ctxSseUrl;
  const pollIntervalMs = options.pollIntervalMs ?? 30000;

  const [count, setCount] = useState(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await client.unreadCount();
      if (mountedRef.current) setCount(next);
    } catch {
      // Swallow — a transient count fetch failure shouldn't crash the bell.
    }
  }, [client]);

  // Initial fetch + lifecycle flag.
  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  // SSE subscription (browser only).
  useEffect(() => {
    if (!sseUrl || !hasEventSource()) return;
    let source: EventSource | null = null;
    try {
      source = new EventSource(sseUrl, { withCredentials: options.withCredentials });
    } catch {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      // If the server sends a count in the payload, trust it; else re-fetch.
      const inline = extractCount(event.data);
      if (inline != null && mountedRef.current) {
        setCount(inline);
      } else {
        void refresh();
      }
    };

    source.addEventListener('message', onMessage);
    // The SSE channel defaults to the `notification` event name.
    source.addEventListener('notification', onMessage as EventListener);
    source.addEventListener('error', () => {
      // Browser auto-reconnects; nothing to do.
    });

    return () => {
      source?.removeEventListener('message', onMessage);
      source?.removeEventListener('notification', onMessage as EventListener);
      source?.close();
    };
  }, [sseUrl, options.withCredentials, refresh]);

  // Polling fallback (also a backstop when SSE is unavailable at runtime).
  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    if (sseUrl && hasEventSource()) return; // SSE covers live updates.
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => void refresh(), pollIntervalMs);
    return () => window.clearInterval(id);
  }, [pollIntervalMs, sseUrl, refresh]);

  return { count, refresh };
}

/** Try to read a numeric count out of an SSE payload (number, or `{ count }`). */
function extractCount(data: unknown): number | null {
  if (typeof data === 'number') return data;
  if (typeof data !== 'string') return null;
  const trimmed = data.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'number') return parsed;
    if (parsed && typeof parsed === 'object' && typeof parsed.count === 'number') {
      return parsed.count;
    }
  } catch {
    // Not JSON — caller will re-fetch.
  }
  return null;
}
