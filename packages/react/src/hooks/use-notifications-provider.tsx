import { type ReactNode, createContext, createElement, useContext, useMemo } from 'react';
import { NotificationsClient } from '../client';
import type { NotificationsClientOptions } from '../types';

/** Value held by the {@link NotificationsContext}. */
export interface NotificationsContextValue {
  /** Configured client the hooks call. */
  client: NotificationsClient;
  /** Optional SSE endpoint the hooks subscribe to (browser `EventSource`). */
  sseUrl?: string;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Props for {@link NotificationsProvider}. */
export interface NotificationsProviderProps {
  /**
   * A ready {@link NotificationsClient}, or options to build one. Passing
   * options lets the provider memoize the client for you.
   */
  client?: NotificationsClient;
  /** Options used to build a client when `client` is not provided. */
  clientOptions?: NotificationsClientOptions;
  /** SSE endpoint URL pushed by the host (e.g. `'/notifications/stream'`). */
  sseUrl?: string;
  children: ReactNode;
}

/**
 * Configure the notifications client (and optional SSE URL) once for a subtree.
 * `useNotifications` / `useUnreadCount` read from this context unless given
 * explicit options.
 *
 * ```tsx
 * <NotificationsProvider
 *   clientOptions={{ baseUrl: '/api', credentials: 'include' }}
 *   sseUrl="/api/notifications/stream"
 * >
 *   <App />
 * </NotificationsProvider>
 * ```
 *
 * Written with `createElement` (no JSX in the returned element) so it stays
 * easy to reason about, but the file is `.tsx` for the JSX-ready types.
 */
export function NotificationsProvider({
  client,
  clientOptions,
  sseUrl,
  children,
}: NotificationsProviderProps) {
  const value = useMemo<NotificationsContextValue>(
    () => ({ client: client ?? new NotificationsClient(clientOptions), sseUrl }),
    [client, clientOptions, sseUrl],
  );
  return createElement(NotificationsContext.Provider, { value }, children);
}

/**
 * Read the nearest {@link NotificationsProvider} value. Returns `null` when
 * none is mounted, so hooks can fall back to explicit options.
 */
export function useNotificationsContext(): NotificationsContextValue | null {
  return useContext(NotificationsContext);
}

/**
 * Resolve the client/SSE URL a hook should use: explicit options win, then the
 * provider. Throws a helpful error if neither supplies a client. This is a hook
 * (it reads context) — call it from the top level of other hooks only.
 */
export function useResolvedContext(explicit?: {
  client?: NotificationsClient;
  clientOptions?: NotificationsClientOptions;
  sseUrl?: string;
}): NotificationsContextValue {
  const ctx = useNotificationsContext();
  const client =
    explicit?.client ??
    (explicit?.clientOptions ? new NotificationsClient(explicit.clientOptions) : undefined) ??
    ctx?.client;
  if (!client) {
    throw new Error(
      'No NotificationsClient available. Wrap your app in <NotificationsProvider> or pass `client`/`clientOptions` to the hook.',
    );
  }
  return { client, sseUrl: explicit?.sseUrl ?? ctx?.sseUrl };
}
