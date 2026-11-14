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
 * Pagination metadata of a {@link PaginatedNotifications} page — the Aviary offset list `meta`.
 * Pages are 1-based.
 */
export interface PaginationMeta {
  /** Total matching notifications across all pages. */
  total: number;
  /** Page size the server used (the requested `size`, clamped by the server). */
  perPage: number;
  /** The page these rows are. */
  currentPage: number;
  /** Number of the last page (`max(1, ceil(total / perPage))`). */
  lastPage: number;
  /** Always `1`. */
  firstPage: number;
}

/**
 * A page of notifications, in the Aviary offset list envelope:
 * `{ data, meta: { total, perPage, currentPage, lastPage, firstPage } }`.
 */
export interface PaginatedNotifications {
  data: NotificationItem[];
  meta: PaginationMeta;
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
   * Resource segment the inbox controller is mounted at, appended to `baseUrl`. Defaults to
   * `'notifications'`. Set this when the host mounts `createNotificationsController({ path })` at a
   * non-default path (e.g. to avoid colliding with a `/notifications` page route).
   */
  path?: string;
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

/**
 * Filter params shared by `list()`, `unread()`, and `unreadCount()`. `types`, when present and
 * non-empty, is sent as `filter[type]=A,B`; absent/empty = no filter (matches every type).
 */
export interface NotificationsFilterParams {
  types?: string[];
}

/** Query params for listing notifications. */
export interface ListParams extends NotificationsFilterParams {
  /** 1-based page number. Default 1. */
  page?: number;
  /** Page size. Default 20; the server clamps it to 100. */
  size?: number;
}
