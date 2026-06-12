import { subscribeNotificationsStream } from '@dudousxd/nestjs-notifications-client';
import { useEffect, useRef } from 'react';

/** Options for {@link useNotificationsStream}. */
export interface UseNotificationsStreamOptions {
  /** URL of the SSE stream endpoint, e.g. `/api/notifications/stream`. */
  url: string;
  /**
   * Called whenever the server pushes a change. Refetch/invalidate your notification queries here —
   * e.g. with TanStack Query: `() => queryClient.invalidateQueries({ queryKey: ['notifications'] })`.
   */
  onUpdate: () => void;
  /** fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Forwarded to `fetch`; set `'same-origin'`/`'omit'` to change cookie behavior. Default `'include'`. */
  credentials?: RequestCredentials;
  /** Dynamic request headers (e.g. a bearer token), evaluated on every (re)connect. */
  headers?: () => Record<string, string>;
  /** Invoked when a connection attempt fails or drops. */
  onError?: (err: unknown) => void;
  /** Pause the subscription when `false`. Default `true`. */
  enabled?: boolean;
}

/**
 * Subscribe to the notifications SSE stream for the lifetime of the component, calling `onUpdate` on
 * every server push. A thin wrapper over {@link subscribeNotificationsStream} — deliberately query-
 * library agnostic: you decide what `onUpdate` does (invalidate TanStack queries, bump a counter…).
 *
 * `onUpdate`/`headers`/`onError` are read through refs, so passing fresh closures each render does
 * **not** reconnect the stream; it only reconnects when `url`, `fetch`, or `enabled` change.
 *
 * ```tsx
 * const queryClient = useQueryClient();
 * useNotificationsStream({
 *   url: '/api/notifications/stream',
 *   headers: () => ({ Authorization: `Bearer ${getToken()}` }),
 *   onUpdate: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
 * });
 * ```
 */
export function useNotificationsStream(options: UseNotificationsStreamOptions): void {
  const { url, fetch: fetchImpl, credentials, enabled = true } = options;

  const onUpdateRef = useRef(options.onUpdate);
  onUpdateRef.current = options.onUpdate;
  const headersRef = useRef(options.headers);
  headersRef.current = options.headers;
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  useEffect(() => {
    if (!enabled) return;
    return subscribeNotificationsStream({
      url,
      fetch: fetchImpl,
      credentials,
      onUpdate: () => onUpdateRef.current(),
      headers: () => headersRef.current?.() ?? {},
      onError: (err) => onErrorRef.current?.(err),
    });
  }, [url, fetchImpl, credentials, enabled]);
}
