import type { NotificationItem } from '@dudousxd/nestjs-notifications-client';
import { describe, expect, it } from 'vitest';
import {
  formatRelativeTime,
  isUnread,
  mergeNotifications,
  notificationBody,
  notificationTitle,
  toTime,
} from './utils';

function make(overrides: Partial<NotificationItem> & { id: string }): NotificationItem {
  return {
    type: 'Test',
    notifiableType: 'User',
    notifiableId: '1',
    tenantId: null,
    data: {},
    readAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mergeNotifications', () => {
  it('dedupes by id and sorts newest-first', () => {
    const a = make({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const b = make({ id: 'b', createdAt: '2026-01-03T00:00:00.000Z' });
    const c = make({ id: 'c', createdAt: '2026-01-02T00:00:00.000Z' });
    const merged = mergeNotifications([a], [b, c, a]);
    expect(merged.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the copy with the later updatedAt for duplicates', () => {
    const old = make({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', readAt: null });
    const fresh = make({
      id: 'a',
      updatedAt: '2026-02-01T00:00:00.000Z',
      readAt: '2026-02-01T00:00:00.000Z',
    });
    const merged = mergeNotifications([old], [fresh]);
    expect(merged).toHaveLength(1);
    expect(merged[0].readAt).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('isUnread', () => {
  it('is true only when readAt is null', () => {
    expect(isUnread(make({ id: 'a', readAt: null }))).toBe(true);
    expect(isUnread(make({ id: 'a', readAt: new Date() }))).toBe(false);
  });
});

describe('toTime', () => {
  it('handles string, Date, null and invalid', () => {
    expect(toTime('2026-01-01T00:00:00.000Z')).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
    const d = new Date();
    expect(toTime(d)).toBe(d.getTime());
    expect(toTime(null)).toBe(0);
    expect(toTime('not-a-date')).toBe(0);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-06-10T12:00:00.000Z');
  it('formats buckets', () => {
    expect(formatRelativeTime(new Date(now - 10_000), now)).toBe('now');
    expect(formatRelativeTime(new Date(now - 5 * 60_000), now)).toBe('5m');
    expect(formatRelativeTime(new Date(now - 3 * 3_600_000), now)).toBe('3h');
    expect(formatRelativeTime(new Date(now - 2 * 86_400_000), now)).toBe('2d');
    expect(formatRelativeTime(new Date(now - 14 * 86_400_000), now)).toBe('2w');
  });
  it('returns empty for missing dates', () => {
    expect(formatRelativeTime(null, now)).toBe('');
  });
});

describe('title/body extraction', () => {
  it('picks conventional keys with fallbacks', () => {
    expect(notificationTitle(make({ id: 'a', data: { subject: 'Hi' } }))).toBe('Hi');
    expect(notificationTitle(make({ id: 'a', type: 'InvoicePaid', data: {} }))).toBe('InvoicePaid');
    expect(notificationBody(make({ id: 'a', data: { message: 'Body' } }))).toBe('Body');
    expect(notificationBody(make({ id: 'a', data: {} }))).toBe('');
  });
});
