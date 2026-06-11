import type {
  ListParams,
  NotificationItem,
  NotificationsClientOptions,
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
  private readonly headers: NotificationsClientOptions['headers'];
  private readonly credentials?: RequestCredentials;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NotificationsClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? '/');
    this.headers = options.headers;
    this.credentials = options.credentials;
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
    const qs = query.toString();
    const raw = await this.request<RawPaginated>('GET', `notifications${qs ? `?${qs}` : ''}`);
    return normalizePaginated(raw, params);
  }

  /** Unread notifications for the current notifiable. */
  unread(): Promise<NotificationItem[]> {
    return this.request<NotificationItem[]>('GET', 'notifications/unread');
  }

  /** Number of unread notifications for the current notifiable. */
  async unreadCount(): Promise<number> {
    const res = await this.request<{ count: number }>('GET', 'notifications/unread/count');
    return res.count;
  }

  /** Mark a single notification as read. */
  async markAsRead(id: string): Promise<void> {
    await this.request<void>('POST', `notifications/${encodeURIComponent(id)}/read`);
  }

  /** Mark every notification for the current notifiable as read. */
  async markAllAsRead(): Promise<void> {
    await this.request<void>('POST', 'notifications/read-all');
  }

  /** Delete a single notification. */
  async remove(id: string): Promise<void> {
    await this.request<void>('DELETE', `notifications/${encodeURIComponent(id)}`);
  }

  private async request<T>(method: string, path: string): Promise<T> {
    const headers = await this.resolveHeaders();
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      credentials: this.credentials,
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

/** Backend page shape — `items` is canonical; `data` is tolerated as an alias. */
interface RawPaginated {
  items?: NotificationItem[];
  data?: NotificationItem[];
  page?: number;
  perPage?: number;
  total?: number;
}

function normalizePaginated(raw: RawPaginated, params: ListParams): PaginatedNotifications {
  const items = raw.items ?? raw.data ?? [];
  return {
    items,
    page: raw.page ?? params.page ?? 1,
    perPage: raw.perPage ?? params.perPage ?? items.length,
    total: raw.total ?? items.length,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

async function parseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
