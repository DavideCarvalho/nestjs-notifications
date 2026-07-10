import type {
  ListParams,
  NotificationItem,
  NotificationsClientOptions,
  NotificationsFilterParams,
  PaginatedNotifications,
} from './types';

/**
 * Small `fetch` wrapper around the nestjs-notifications read API. Targets the
 * endpoints exposed by `createNotificationsController` (mounted by the host):
 *
 * - `GET    {baseUrl}notifications?page&perPage`
 * - `GET    {baseUrl}notifications/unread`
 * - `GET    {baseUrl}notifications/unread/count`
 * - `POST   {baseUrl}notifications/:id/read`
 * - `POST   {baseUrl}notifications/read-all`
 * - `DELETE {baseUrl}notifications/:id`
 *
 * ```ts
 * const client = new NotificationsClient({
 *   baseUrl: 'https://api.example.com/',
 *   headers: { Authorization: `Bearer ${token}` },
 * });
 * const page = await client.list({ page: 1 });
 * ```
 */
export class NotificationsClient {
  private readonly baseUrl: string;
  private readonly path: string;
  private readonly headers: NotificationsClientOptions['headers'];
  private readonly credentials?: RequestCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly sseUrl?: string;

  constructor(options: NotificationsClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? '/');
    // The resource segment the inbox controller is mounted at — defaults to `notifications`, but a
    // host that mounts `createNotificationsController({ path })` elsewhere can point the client at it.
    this.path = (options.path ?? 'notifications').replace(/^\/+|\/+$/g, '');
    this.headers = options.headers;
    // Assign optional fields only when present so `exactOptionalPropertyTypes` is honored
    // (these stay absent rather than explicitly `undefined`).
    if (options.credentials !== undefined) this.credentials = options.credentials;
    if (options.sseUrl !== undefined) this.sseUrl = options.sseUrl;
    const f = options.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      throw new Error(
        'NotificationsClient: no `fetch` available. Pass `fetch` in options for non-browser runtimes.',
      );
    }
    // Bind to preserve `this` for the global fetch.
    this.fetchImpl = options.fetch ?? f.bind(globalThis);
  }

  /** List notifications for the current notifiable (paginated). */
  async list(params: ListParams = {}): Promise<PaginatedNotifications> {
    const query = new URLSearchParams();
    if (params.page != null) query.set('page', String(params.page));
    if (params.perPage != null) query.set('perPage', String(params.perPage));
    setTypeParam(query, params.types);
    const qs = query.toString();
    const raw = await this.request<RawPaginated>('GET', `${this.path}${qs ? `?${qs}` : ''}`);
    return normalizePaginated(raw, params);
  }

  /** Unread notifications for the current notifiable. */
  unread(params: NotificationsFilterParams = {}): Promise<NotificationItem[]> {
    const query = new URLSearchParams();
    setTypeParam(query, params.types);
    const qs = query.toString();
    return this.request<NotificationItem[]>('GET', `${this.path}/unread${qs ? `?${qs}` : ''}`);
  }

  /** Number of unread notifications for the current notifiable. */
  async unreadCount(params: NotificationsFilterParams = {}): Promise<number> {
    const query = new URLSearchParams();
    setTypeParam(query, params.types);
    const qs = query.toString();
    const res = await this.request<{ count: number }>(
      'GET',
      `${this.path}/unread/count${qs ? `?${qs}` : ''}`,
    );
    return res.count;
  }

  /** Mark a single notification as read. */
  async markAsRead(id: string): Promise<void> {
    await this.request<void>('POST', `${this.path}/${encodeURIComponent(id)}/read`);
  }

  /** Mark every notification for the current notifiable as read. */
  async markAllAsRead(): Promise<void> {
    await this.request<void>('POST', `${this.path}/read-all`);
  }

  /** Delete a single notification. */
  async remove(id: string): Promise<void> {
    await this.request<void>('DELETE', `${this.path}/${encodeURIComponent(id)}`);
  }

  /**
   * Subscribe to the SSE stream for live updates. Calls `listener` on each push; the event carries
   * the unread `count` when the server includes one in the payload (else `count` is undefined and the
   * caller should re-fetch). Returns an unsubscribe function. SSR-safe: a no-op (returns () => {}) when
   * `EventSource` is unavailable or no `sseUrl` is configured.
   */
  subscribe(listener: (event: { count?: number }) => void, opts?: { sseUrl?: string }): () => void {
    const url = opts?.sseUrl ?? this.sseUrl;
    if (!url || !hasEventSource()) return () => {};

    let source: EventSource | null = null;
    try {
      source = new EventSource(url, { withCredentials: this.credentials === 'include' });
    } catch {
      return () => {};
    }

    const onMessage = (event: MessageEvent) => {
      const count = extractCount(event.data);
      // Omit `count` entirely when absent rather than passing explicit `undefined`
      // (exactOptionalPropertyTypes), so the listener sees `{}` and re-fetches.
      listener(count == null ? {} : { count });
    };

    source.addEventListener('message', onMessage);
    // The SSE channel defaults to the `notification` event name.
    source.addEventListener('notification', onMessage as EventListener);

    return () => {
      source?.removeEventListener('message', onMessage);
      source?.removeEventListener('notification', onMessage as EventListener);
      source?.close();
    };
  }

  private async request<T>(method: string, path: string): Promise<T> {
    const headers = await this.resolveHeaders();
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      // Spread `credentials` only when configured (exactOptionalPropertyTypes): omitting it
      // lets `fetch` apply its own default rather than receiving an explicit `undefined`.
      ...(this.credentials !== undefined ? { credentials: this.credentials } : {}),
    });
    if (!response.ok) {
      throw new NotificationsApiError(
        `Notifications request failed: ${method} ${path} -> ${response.status}`,
        response.status,
      );
    }
    return parseBody<T>(response);
  }

  private async resolveHeaders(): Promise<Record<string, string>> {
    const base: Record<string, string> = { Accept: 'application/json' };
    if (!this.headers) return base;
    const resolved = typeof this.headers === 'function' ? await this.headers() : this.headers;
    return { ...base, ...resolved };
  }
}

/** Create a {@link NotificationsClient}. */
export function createNotificationsClient(
  options?: NotificationsClientOptions,
): NotificationsClient {
  return new NotificationsClient(options);
}

/** Thrown when the read API responds with a non-2xx status. */
export class NotificationsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'NotificationsApiError';
  }
}

/** Backend page shape — `items` is canonical (`data` tolerated); pagination lives under `meta`. */
interface RawPaginated {
  items?: NotificationItem[];
  data?: NotificationItem[];
  meta?: { page?: number; perPage?: number; total?: number; lastPage?: number };
}

function normalizePaginated(raw: RawPaginated, params: ListParams): PaginatedNotifications {
  const items = raw.items ?? raw.data ?? [];
  const page = raw.meta?.page ?? params.page ?? 1;
  const perPage = raw.meta?.perPage ?? params.perPage ?? items.length;
  const total = raw.meta?.total ?? items.length;
  const lastPage = raw.meta?.lastPage ?? Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  return { items, meta: { page, perPage, total, lastPage } };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

/** Sends `types` as the comma-separated `?type=` param the backend splits/trims; empty = omitted. */
function setTypeParam(query: URLSearchParams, types: string[] | undefined): void {
  if (types && types.length > 0) query.set('type', types.join(','));
}

async function parseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** True when the runtime exposes `EventSource` (browser or polyfilled). */
function hasEventSource(): boolean {
  return typeof EventSource !== 'undefined';
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
