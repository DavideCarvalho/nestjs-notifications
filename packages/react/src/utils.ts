import type { NotificationItem } from './types';

/**
 * Merge two lists of notifications, de-duplicating by `id` and keeping the
 * newer copy of any duplicate (later `updatedAt`/`createdAt` wins). The result
 * is sorted newest-first by `createdAt`. Pure — safe to unit-test.
 */
export function mergeNotifications(
  current: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] {
  const byId = new Map<string, NotificationItem>();
  for (const item of current) byId.set(item.id, item);
  for (const item of incoming) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? newer(existing, item) : item);
  }
  return Array.from(byId.values()).sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
}

/** True when the notification has not been read yet. */
export function isUnread(item: NotificationItem): boolean {
  return item.readAt == null;
}

/** Coerce a string|Date (or null) into epoch millis; `0` when missing/invalid. */
export function toTime(value: string | Date | null | undefined): number {
  if (value == null) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Compact, locale-free relative time (e.g. `"3m"`, `"2h"`, `"5d"`). Returns
 * `"now"` for anything under a minute and falls back to a short date past a
 * week. `now` is injectable for deterministic tests.
 */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  now: number = Date.now(),
): string {
  const time = toTime(value);
  if (time === 0) return '';
  const diff = Math.max(0, now - time);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(time).toLocaleDateString();
}

/**
 * Best-effort extraction of a human title from a notification's `data` payload,
 * checking the conventional keys apps tend to use.
 */
export function notificationTitle(item: NotificationItem): string {
  return pickString(item.data, ['title', 'subject', 'heading', 'name']) ?? item.type;
}

/** Best-effort extraction of a body/message string from `data`. */
export function notificationBody(item: NotificationItem): string {
  return pickString(item.data, ['body', 'message', 'text', 'description', 'content']) ?? '';
}

function pickString(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function newer(a: NotificationItem, b: NotificationItem): NotificationItem {
  return toTime(a.updatedAt) >= toTime(b.updatedAt) ? a : b;
}
