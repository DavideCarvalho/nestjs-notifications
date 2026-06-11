import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';

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
  /** Arbitrary payload returned by `toDatabase()`. */
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Data needed to create a {@link StoredNotification} (id/timestamps assigned by the store). */
export interface NewStoredNotification {
  type: string;
  notifiableType: string;
  notifiableId: string;
  data: Record<string, unknown>;
  tenantId?: string | null;
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
   * Optionally create the backing schema if it's missing — non-destructively (never drops).
   * Called on bootstrap when `autoCreateSchema` is enabled. Stores that don't manage schema
   * (in-memory, or schema-first ORMs like Prisma) may omit it or make it a no-op.
   */
  ensureSchema?(): Promise<void>;
}

/**
 * Implement this on a notification to define its persisted payload. Falls back to
 * `toArray()` (Laravel parity) and finally to a structural copy.
 */
export interface DatabaseNotification extends Notification {
  toDatabase?(notifiable: Notifiable): Record<string, unknown>;
  toArray?(notifiable: Notifiable): Record<string, unknown>;
}
