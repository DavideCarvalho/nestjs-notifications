import type { Notifiable, NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { NotificationStore, StoredNotification } from './interfaces';
import { NOTIFICATION_STORE } from './tokens';

/** A notifiable, or just a stable reference to one. Accepted by every query method. */
export type NotifiableTarget = Notifiable | NotifiableRef;

/** Pagination options for {@link NotificationsQueryService.paginate}. */
export interface PaginateOptions {
  /** 1-based page number. Default 1. */
  page?: number;
  /** Page size. Default 20. */
  perPage?: number;
}

/** A page of stored notifications. */
export interface PaginatedNotifications {
  items: StoredNotification[];
  page: number;
  perPage: number;
  total: number;
}

/**
 * Read side of the database channel: lists and mutates the notifications the channel
 * persisted, mirroring Laravel's `$user->notifications`, `unreadNotifications`,
 * `markAsRead()` and friends. Wraps the {@link NotificationStore} — it does not extend
 * the store interface.
 *
 * ```ts
 * constructor(private readonly notifications: NotificationsQueryService) {}
 * const inbox = await this.notifications.all(user);
 * ```
 */
@Injectable()
export class NotificationsQueryService {
  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
  ) {}

  /** All notifications for the target, newest first (store ordering). */
  async all(target: NotifiableTarget): Promise<StoredNotification[]> {
    const ref = this.refOf(target);
    return this.store.getForNotifiable(ref.type, String(ref.id));
  }

  /** Unread notifications for the target. */
  async unread(target: NotifiableTarget): Promise<StoredNotification[]> {
    const ref = this.refOf(target);
    return this.store.getUnread(ref.type, String(ref.id));
  }

  /** A single page over {@link all}. */
  async paginate(
    target: NotifiableTarget,
    { page = 1, perPage = 20 }: PaginateOptions = {},
  ): Promise<PaginatedNotifications> {
    const safePage = Math.max(1, Math.floor(page));
    const safePerPage = Math.max(1, Math.floor(perPage));
    const items = await this.all(target);
    const start = (safePage - 1) * safePerPage;
    return {
      items: items.slice(start, start + safePerPage),
      page: safePage,
      perPage: safePerPage,
      total: items.length,
    };
  }

  /** Number of unread notifications for the target. */
  async unreadCount(target: NotifiableTarget): Promise<number> {
    return (await this.unread(target)).length;
  }

  /** Mark one notification read by id. */
  async markAsRead(id: string): Promise<void> {
    await this.store.markAsRead(id);
  }

  /** Mark every notification for the target read. */
  async markAllAsRead(target: NotifiableTarget): Promise<void> {
    const ref = this.refOf(target);
    await this.store.markAllAsRead(ref.type, String(ref.id));
  }

  /** Delete one notification by id. */
  async delete(id: string): Promise<void> {
    await this.store.delete(id);
  }

  /**
   * Derive a {@link NotifiableRef} from the target. Accepts a raw ref directly, otherwise
   * prefers `toNotifiableRef()`. Throws if neither is available.
   */
  private refOf(target: NotifiableTarget): NotifiableRef {
    if (isRef(target)) return target;
    const toRef = (target as Notifiable).toNotifiableRef;
    if (typeof toRef === 'function') {
      return toRef.call(target);
    }
    throw new Error(
      'NotificationsQueryService needs a notifiable reference. Pass a { type, id } ref, or ' +
        'implement toNotifiableRef() on the notifiable.',
    );
  }
}

function isRef(value: NotifiableTarget): value is NotifiableRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'id' in value &&
    typeof (value as NotifiableRef).type === 'string'
  );
}
