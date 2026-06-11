/**
 * A notification as it arrives over the wire from the read API. Mirrors the
 * backend `StoredNotification`, but dates may be ISO strings (JSON) or `Date`
 * objects depending on how the host serializes them.
 */
export interface NotificationItem {
  id: string;
  /** Notification class name (e.g. `"InvoicePaid"`). */
  type: string;
  /** Notifiable reference type (e.g. `"User"`). */
  notifiableType: string;
  /** Notifiable reference id. */
  notifiableId: string;
  /** Tenant scope (workspace) this row belongs to, or `null` for single-tenant. */
  tenantId: string | null;
  /** Arbitrary payload returned by the notification's `toDatabase()`. */
  data: Record<string, unknown>;
  readAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * A page of notifications. Mirrors the backend `PaginatedNotifications` (which
 * uses `items`); a `data` alias is accepted for forward compatibility.
 */
export interface PaginatedNotifications {
  items: NotificationItem[];
  page: number;
  perPage: number;
  total: number;
}

/** Options accepted by {@link NotificationsClient}. */
export interface NotificationsClientOptions {
  /**
   * Base URL the read API is mounted at. The `notifications` path is appended,
   * so `https://api.example.com/` targets `https://api.example.com/notifications`.
   * Defaults to `'/'` (same-origin).
   */
  baseUrl?: string;
  /**
   * Static headers sent with every request (e.g. an `Authorization` bearer).
   * May also be a function for per-request resolution (e.g. a fresh token).
   */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  /** Forwarded to `fetch`. Set `'include'` to send cookies cross-origin. */
  credentials?: RequestCredentials;
  /** Custom `fetch` implementation (e.g. for tests or non-browser runtimes). */
  fetch?: typeof fetch;
  /** SSE endpoint for live updates, consumed by `client.subscribe()`. */
  sseUrl?: string;
}

/** Query params for listing notifications. */
export interface ListParams {
  /** 1-based page number. Default 1. */
  page?: number;
  /** Page size. Default 20. */
  perPage?: number;
}
