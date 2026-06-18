import {
  type Notifiable,
  type NotifiableRef,
  notifiableRef,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { NotificationStore, StoredNotification } from './interfaces';
import { READ_SYNC_PUBLISHER, type ReadSyncPublisher } from './read-sync';
import { NOTIFICATION_STORE } from './tokens';

/** A notifiable, or just a stable reference to one. Accepted by every query method. */
export type NotifiableTarget = Notifiable | NotifiableRef;

/** Pagination options for {@link NotificationsQueryService.paginate}. */
export interface PaginateOptions {
  /** 1-based page number. Default 1. */
  page?: number | undefined;
  /** Page size. Default 20. */
  perPage?: number | undefined;
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
  /**
   * Mark one notification read. Pass the owning `target` to also broadcast a cross-device read
   * event (so the user's other devices update); omit it to just persist (unchanged behavior).
   */
  markAsRead(id: string, target?: NotifiableTarget): Promise<void>;
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
    // Optional cross-device read-sync publisher (e.g. SSE-backed). Absent → no-op.
    @Optional()
    @Inject(READ_SYNC_PUBLISHER)
    private readonly readSync?: ReadSyncPublisher,
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

  async markAsRead(id: string, target?: NotifiableTarget): Promise<void> {
    await this.store.markAsRead(id);
    if (target) this.publishRead(this.refOf(target), id, undefined);
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
      markAsRead: async (id, target) => {
        await this.store.markAsRead(id);
        if (target) this.publishRead(this.refOf(target), id, tenant);
      },
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
    const offset = (safePage - 1) * safePerPage;
    const meta = (total: number): PaginationMeta => ({
      page: safePage,
      perPage: safePerPage,
      total,
      lastPage: Math.max(1, Math.ceil(total / safePerPage)),
    });

    // Push limit/offset down into the store when it supports it — scales to large feeds.
    if (this.store.paginateForNotifiable) {
      const ref = this.refOf(target);
      const { items, total } = await this.store.paginateForNotifiable(ref.type, String(ref.id), {
        limit: safePerPage,
        offset,
        tenantId: tenant,
      });
      return { items, meta: meta(total) };
    }

    // Fallback for stores without pushdown: fetch all rows and slice (correct, not scalable).
    const all = await this.allScoped(target, tenant);
    return {
      items: all.slice(offset, offset + safePerPage),
      meta: meta(all.length),
    };
  }

  private async unreadCountScoped(target: NotifiableTarget, tenant?: string): Promise<number> {
    return (await this.unreadScoped(target, tenant)).length;
  }

  private async markAllAsReadScoped(target: NotifiableTarget, tenant?: string): Promise<void> {
    const ref = this.refOf(target);
    await this.store.markAllAsRead(ref.type, String(ref.id), tenant);
    // notificationId: null signals "all read" to the other devices.
    this.publishRead(ref, null, tenant);
  }

  /** Broadcast a cross-device read event (no-op when no publisher is bound). Errors are swallowed. */
  private publishRead(ref: NotifiableRef, notificationId: string | null, tenant?: string): void {
    if (!this.readSync) return;
    try {
      void Promise.resolve(
        this.readSync.publishRead({
          ref: { type: ref.type, id: String(ref.id) },
          tenantId: tenant,
          notificationId,
          readAt: new Date().toISOString(),
        }),
      ).catch(() => {});
    } catch {
      // Read sync is best-effort; never fail the mutation because the broadcast failed.
    }
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
