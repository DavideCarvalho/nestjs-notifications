import type { ChannelContext, Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';

/** A persisted notification row, mirroring Laravel's `notifications` table. */
export interface StoredNotification {
  id: string;
  /** Notification class name (e.g. "InvoicePaid"). */
  type: string;
  /** Notifiable reference type (e.g. "User"). */
  notifiableType: string;
  /** Notifiable reference id. */
  notifiableId: string;
  /** Tenant scope (workspace) this row belongs to, or null for single-tenant. */
  tenantId: string | null;
  /**
   * Morph type of WHO triggered this notification (the captured causer's `type`), or null.
   * Populated from `@dudousxd/nestjs-context` when present; null on old rows / no context.
   */
  causerType: string | null;
  /** Id of WHO triggered this notification (the captured causer's `id`), or null. */
  causerId: string | null;
  /** Correlation/trace id of the triggering request, for end-to-end tracing, or null. */
  traceId: string | null;
  /** Arbitrary payload returned by `toDatabase()`. */
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Options for {@link NotificationStore.paginateForNotifiable}. */
export interface PaginateForNotifiableOptions {
  /** Max rows to return for this page. */
  limit: number;
  /** Rows to skip before the page (`(page - 1) * perPage`). */
  offset: number;
  /** Tenant scope; `undefined` matches all tenants (single-tenant behavior). */
  tenantId?: string | undefined;
}

/** A single page of stored notifications plus the total matching count, returned by the store. */
export interface PaginatedStoredNotifications {
  items: StoredNotification[];
  /** Total matching rows across all pages (for computing `lastPage`). */
  total: number;
}

/** Data needed to create a {@link StoredNotification} (id/timestamps assigned by the store). */
export interface NewStoredNotification {
  type: string;
  notifiableType: string;
  notifiableId: string;
  data: Record<string, unknown>;
  tenantId?: string | null;
  /**
   * WHO triggered the notification + the correlation trace, captured from
   * `@dudousxd/nestjs-context` at send() time (additive, all optional). Stores that support
   * the columns persist them; others ignore them. Back-compat: omitted → stored as null.
   */
  causerType?: string | null;
  causerId?: string | null;
  traceId?: string | null;
}

/** Data for an upsert — same as {@link NewStoredNotification} plus the caller-controlled id. */
export interface UpsertStoredNotification extends NewStoredNotification {
  id: string;
}

/**
 * Persistence abstraction. Implemented by the in-memory store and ORM adapter packages. The
 * `tenantId` filter on the read methods scopes results to a tenant; `undefined` matches all
 * tenants (single-tenant behavior).
 */
export interface NotificationStore {
  save(notification: NewStoredNotification): Promise<StoredNotification>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(notifiableType: string, notifiableId: string, tenantId?: string): Promise<void>;
  getForNotifiable(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<StoredNotification[]>;
  getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<StoredNotification[]>;
  delete(id: string): Promise<void>;
  /**
   * Optionally fetch a single page of a notifiable's notifications, pushing `limit`/`offset` down
   * into the data store (instead of fetching every row and slicing in memory). Returns the page
   * plus the total matching count. Ordered newest-first, like {@link getForNotifiable}. Stores that
   * don't implement it cause {@link NotificationsQueryService.paginate} to fall back to fetching all
   * rows and slicing — correct, but not scalable. Implemented by the in-memory and ORM adapters.
   */
  paginateForNotifiable?(
    notifiableType: string,
    notifiableId: string,
    options: PaginateForNotifiableOptions,
  ): Promise<PaginatedStoredNotifications>;
  /**
   * Optionally create the backing schema if it's missing — non-destructively (never drops).
   * Called on bootstrap when `autoCreateSchema` is enabled. Stores that don't manage schema
   * (in-memory, or schema-first ORMs like Prisma) may omit it or make it a no-op.
   */
  ensureSchema?(): Promise<void>;
  /**
   * Optionally bulk-delete notifications older than a cutoff, for the scheduled
   * {@link import('./notification-pruner').NotificationPruner}. Removes rows created at or
   * before `before`; `onlyRead` limits deletion to rows that have been read. Returns how many
   * were deleted. Stores that don't implement it are skipped (the pruner logs a warning).
   */
  prune?(options: { before: Date; onlyRead?: boolean | undefined }): Promise<number>;
  /**
   * Optionally insert-or-update a notification by its caller-controlled `id`, for "live" /
   * progress notifications that evolve in place (e.g. an export going 0% → 100%). When the row
   * exists it updates `type`/`data`/`notifiable*`/`tenantId`/`updatedAt` and **resets `readAt` to
   * null** (an update is treated as a fresh, unread event); `createdAt` is preserved. When it
   * doesn't exist it inserts with the given id. Used by the database channel when a notification
   * exposes a {@link DatabaseNotification.databaseKey}. Stores that don't implement it fall back to
   * `save()` (the channel logs a warning).
   */
  upsert?(notification: UpsertStoredNotification): Promise<StoredNotification>;
}

/**
 * Implement this on a notification to define its persisted payload. Falls back to
 * `toArray()` (Laravel parity) and finally to a structural copy.
 */
export interface DatabaseNotification extends Notification {
  toDatabase?(ctx: ChannelContext): Record<string, unknown>;
  toArray?(notifiable: Notifiable): Record<string, unknown>;
  /**
   * A stable, caller-controlled id for "live"/progress notifications that should update a single row
   * in place across multiple sends (e.g. an export progressing 0% → 100%) instead of inserting a new
   * row each time. Return the same string on each `send()` for the same logical notification — the
   * database channel then {@link NotificationStore.upsert | upserts} that row. The value is used
   * directly as the row id, so namespace it for uniqueness (e.g. `file-export:${exportId}`). Return
   * `undefined` (the default — omit the method) for normal insert-per-send behavior.
   */
  databaseKey?(notifiable: Notifiable): string | undefined;
}
