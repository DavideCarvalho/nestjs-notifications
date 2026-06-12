import {
  type Notifiable,
  type NotifiableRef,
  notifiableRef,
} from '@dudousxd/nestjs-notifications-core';
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

/** Pagination metadata for a {@link PaginatedNotifications} page. */
export interface PaginationMeta {
  /** 1-based current page. */
  page: number;
  perPage: number;
  /** Total matching notifications across all pages. */
  total: number;
  /** Number of the last page (`max(1, ceil(total / perPage))`). */
  lastPage: number;
}

/** A page of stored notifications. `meta` follows the conventional `{ page, lastPage, … }` shape. */
export interface PaginatedNotifications {
  items: StoredNotification[];
  meta: PaginationMeta;
}

/** Tenant-scoped read API — same methods as {@link NotificationsQueryService}. */
export interface ScopedNotificationsQuery {
  all(target: NotifiableTarget): Promise<StoredNotification[]>;
  unread(target: NotifiableTarget): Promise<StoredNotification[]>;
  paginate(target: NotifiableTarget, options?: PaginateOptions): Promise<PaginatedNotifications>;
  unreadCount(target: NotifiableTarget): Promise<number>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(target: NotifiableTarget): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * Read side of the database channel: lists and mutates the notifications the channel
 * persisted, mirroring Laravel's `$user->notifications`, `unreadNotifications`, `markAsRead()`.
 * Scope to a tenant with `forTenant(id)` — the same user has an isolated feed per tenant.
 *
 * ```ts
 * const inbox = await this.notifications.all(user);
 * const wsInbox = await this.notifications.forTenant(workspaceId).unread(user);
 * ```
 */
@Injectable()
export class NotificationsQueryService implements ScopedNotificationsQuery {
  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
  ) {}

  all(target: NotifiableTarget): Promise<StoredNotification[]> {
    return this.allScoped(target, undefined);
  }

  unread(target: NotifiableTarget): Promise<StoredNotification[]> {
    return this.unreadScoped(target, undefined);
  }

  paginate(
    target: NotifiableTarget,
    options: PaginateOptions = {},
  ): Promise<PaginatedNotifications> {
    return this.paginateScoped(target, options, undefined);
  }

  unreadCount(target: NotifiableTarget): Promise<number> {
    return this.unreadCountScoped(target, undefined);
  }

  async markAsRead(id: string): Promise<void> {
    await this.store.markAsRead(id);
  }

  markAllAsRead(target: NotifiableTarget): Promise<void> {
    return this.markAllAsReadScoped(target, undefined);
  }

  async delete(id: string): Promise<void> {
    await this.store.delete(id);
  }

  /** Scope every read/mutation to a tenant (workspace). */
  forTenant(tenant: string): ScopedNotificationsQuery {
    return {
      all: (target) => this.allScoped(target, tenant),
      unread: (target) => this.unreadScoped(target, tenant),
      paginate: (target, options) => this.paginateScoped(target, options ?? {}, tenant),
      unreadCount: (target) => this.unreadCountScoped(target, tenant),
      markAsRead: (id) => this.markAsRead(id),
      markAllAsRead: (target) => this.markAllAsReadScoped(target, tenant),
      delete: (id) => this.delete(id),
    };
  }

  private async allScoped(
    target: NotifiableTarget,
    tenant?: string,
  ): Promise<StoredNotification[]> {
    const ref = this.refOf(target);
    return this.store.getForNotifiable(ref.type, String(ref.id), tenant);
  }

  private async unreadScoped(
    target: NotifiableTarget,
    tenant?: string,
  ): Promise<StoredNotification[]> {
    const ref = this.refOf(target);
    return this.store.getUnread(ref.type, String(ref.id), tenant);
  }

  private async paginateScoped(
    target: NotifiableTarget,
    { page = 1, perPage = 20 }: PaginateOptions,
    tenant?: string,
  ): Promise<PaginatedNotifications> {
    const safePage = Math.max(1, Math.floor(page));
    const safePerPage = Math.max(1, Math.floor(perPage));
    const items = await this.allScoped(target, tenant);
    const total = items.length;
    const start = (safePage - 1) * safePerPage;
    return {
      items: items.slice(start, start + safePerPage),
      meta: {
        page: safePage,
        perPage: safePerPage,
        total,
        lastPage: Math.max(1, Math.ceil(total / safePerPage)),
      },
    };
  }

  private async unreadCountScoped(target: NotifiableTarget, tenant?: string): Promise<number> {
    return (await this.unreadScoped(target, tenant)).length;
  }

  private async markAllAsReadScoped(target: NotifiableTarget, tenant?: string): Promise<void> {
    const ref = this.refOf(target);
    await this.store.markAllAsRead(ref.type, String(ref.id), tenant);
  }

  /** Accepts a raw ref, a `toNotifiableRef()`, or a `@NotifiableId()`-decorated notifiable. */
  private refOf(target: NotifiableTarget): NotifiableRef {
    return isRef(target) ? target : notifiableRef(target as Notifiable);
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
