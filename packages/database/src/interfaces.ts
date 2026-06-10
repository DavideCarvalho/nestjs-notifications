import type { Notifiable, Notification } from '@nestjs-notifications/core';

/** A persisted notification row, mirroring Laravel's `notifications` table. */
export interface StoredNotification {
  id: string;
  /** Notification class name (e.g. "InvoicePaid"). */
  type: string;
  /** Notifiable reference type (e.g. "User"). */
  notifiableType: string;
  /** Notifiable reference id. */
  notifiableId: string;
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
}

/** Persistence abstraction. Implemented by the in-memory store and ORM adapter packages. */
export interface NotificationStore {
  save(notification: NewStoredNotification): Promise<StoredNotification>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(notifiableType: string, notifiableId: string): Promise<void>;
  getForNotifiable(notifiableType: string, notifiableId: string): Promise<StoredNotification[]>;
  getUnread(notifiableType: string, notifiableId: string): Promise<StoredNotification[]>;
  delete(id: string): Promise<void>;
}

/**
 * Implement this on a notification to define its persisted payload. Falls back to
 * `toArray()` (Laravel parity) and finally to a structural copy.
 */
export interface DatabaseNotification extends Notification {
  toDatabase?(notifiable: Notifiable): Record<string, unknown>;
  toArray?(notifiable: Notifiable): Record<string, unknown>;
}
