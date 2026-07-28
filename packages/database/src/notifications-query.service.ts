import {
  type Notifiable,
  type NotifiableRef,
  notifiableRef,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { NotificationOwnerRef, NotificationStore, StoredNotification } from './interfaces';
import { READ_SYNC_PUBLISHER, type ReadSyncPublisher } from './read-sync';
import { NOTIFICATION_STORE } from './tokens';

/** A notifiable, or just a stable reference to one. Accepted by every query method. */
export type NotifiableTarget = Notifiable | NotifiableRef;

/**
 * Filter options shared by {@link ScopedNotificationsQuery.all}, {@link
 * ScopedNotificationsQuery.unread}, and {@link ScopedNotificationsQuery.unreadCount}.
 */
export interface NotificationsFilterOptions {
  /** Only include notifications whose `type` is one of these; absent/empty = no filter. */
  types?: string[] | undefined;
}

/** Pagination options for {@link NotificationsQueryService.paginate}. */
export interface PaginateOptions {
  /** 1-based page number. Default 1. */
  page?: number | undefined;
  /** Page size. Default 20. */
  perPage?: number | undefined;
  /** Only include notifications whose `type` is one of these; absent/empty = no filter. */
  types?: string[] | undefined;
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
  all(
    target: NotifiableTarget,
    options?: NotificationsFilterOptions,
  ): Promise<StoredNotification[]>;
  unread(
    target: NotifiableTarget,
    options?: NotificationsFilterOptions,
  ): Promise<StoredNotification[]>;
  paginate(target: NotifiableTarget, options?: PaginateOptions): Promise<PaginatedNotifications>;
  unreadCount(target: NotifiableTarget, options?: NotificationsFilterOptions): Promise<number>;
  /**
   * Mark one notification read. Pass the owning `target` to enforce that the notification belongs
   * to it (throwing `NotFoundException` when it doesn't) and to broadcast a cross-device read event
   * so the user's other devices update. Omit it to just persist, unscoped (unchanged behavior).
   */
  markAsRead(id: string, target?: NotifiableTarget): Promise<void>;
  markAllAsRead(target: NotifiableTarget): Promise<void>;
  /**
   * Delete one notification. Pass the owning `target` to enforce that it belongs to that notifiable,
   * throwing `NotFoundException` otherwise. Omit it to delete unscoped (unchanged behavior).
   */
  delete(id: string, target?: NotifiableTarget): Promise<void>;
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
  private readonly logger = new Logger('Notifications');

  /** Guards {@link warnUnenforceable} — a store capability gap is worth saying once, not per call. */
  private static warnedUnenforceable = false;

  /** Test seam: re-arm the once-per-process warning. */
  static resetOwnershipWarning(): void {
    NotificationsQueryService.warnedUnenforceable = false;
  }

  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
    // Optional cross-device read-sync publisher (e.g. SSE-backed). Absent → no-op.
    @Optional()
    @Inject(READ_SYNC_PUBLISHER)
    private readonly readSync?: ReadSyncPublisher,
  ) {}

  all(
    target: NotifiableTarget,
    options: NotificationsFilterOptions = {},
  ): Promise<StoredNotification[]> {
    return this.allScoped(target, undefined, options.types);
  }

  unread(
    target: NotifiableTarget,
    options: NotificationsFilterOptions = {},
  ): Promise<StoredNotification[]> {
    return this.unreadScoped(target, undefined, options.types);
  }

  paginate(
    target: NotifiableTarget,
    options: PaginateOptions = {},
  ): Promise<PaginatedNotifications> {
    return this.paginateScoped(target, options, undefined);
  }

  unreadCount(target: NotifiableTarget, options: NotificationsFilterOptions = {}): Promise<number> {
    return this.unreadCountScoped(target, undefined, options.types);
  }

  async markAsRead(id: string, target?: NotifiableTarget): Promise<void> {
    await this.markAsReadScoped(id, target, undefined);
  }

  markAllAsRead(target: NotifiableTarget): Promise<void> {
    return this.markAllAsReadScoped(target, undefined);
  }

  async delete(id: string, target?: NotifiableTarget): Promise<void> {
    await this.deleteScoped(id, target, undefined);
  }

  /** Scope every read/mutation to a tenant (workspace). */
  forTenant(tenant: string): ScopedNotificationsQuery {
    return {
      all: (target, options) => this.allScoped(target, tenant, options?.types),
      unread: (target, options) => this.unreadScoped(target, tenant, options?.types),
      paginate: (target, options) => this.paginateScoped(target, options ?? {}, tenant),
      unreadCount: (target, options) => this.unreadCountScoped(target, tenant, options?.types),
      markAsRead: (id, target) => this.markAsReadScoped(id, target, tenant),
      markAllAsRead: (target) => this.markAllAsReadScoped(target, tenant),
      delete: (id, target) => this.deleteScoped(id, target, tenant),
    };
  }

  /**
   * Mark read, enforcing ownership when a `target` is given. The tenant is carried into the owner
   * ref so a tenant-scoped query can't touch another tenant's row for the same notifiable.
   */
  private async markAsReadScoped(
    id: string,
    target: NotifiableTarget | undefined,
    tenant: string | undefined,
  ): Promise<void> {
    if (!target) {
      await this.store.markAsRead(id);
      return;
    }
    const ref = this.refOf(target);
    const owner = this.ownerRef(ref, tenant);
    if (this.store.markAsReadOwned) {
      if (!(await this.store.markAsReadOwned(id, owner))) throw new NotFoundException();
    } else {
      await this.assertOwned(id, owner, 'markAsRead');
      await this.store.markAsRead(id);
    }
    this.publishRead(ref, id, tenant);
  }

  /** Delete, enforcing ownership when a `target` is given. See {@link markAsReadScoped}. */
  private async deleteScoped(
    id: string,
    target: NotifiableTarget | undefined,
    tenant: string | undefined,
  ): Promise<void> {
    if (!target) {
      await this.store.delete(id);
      return;
    }
    const owner = this.ownerRef(this.refOf(target), tenant);
    if (this.store.deleteOwned) {
      if (!(await this.store.deleteOwned(id, owner))) throw new NotFoundException();
      return;
    }
    await this.assertOwned(id, owner, 'delete');
    await this.store.delete(id);
  }

  /**
   * Ownership fallback for stores without the scoped mutations: read the row and compare. Throws
   * `NotFoundException` — never `ForbiddenException` — so a caller can't tell "someone else's" from
   * "doesn't exist" and use the endpoint to enumerate ids.
   *
   * A store implementing neither the scoped form nor `findById` cannot enforce ownership at all;
   * that degrades to the unchecked mutation, but says so loudly rather than silently.
   */
  private async assertOwned(
    id: string,
    owner: NotificationOwnerRef,
    operation: string,
  ): Promise<void> {
    if (!this.store.findById) {
      this.warnUnenforceable(operation);
      return;
    }
    const row = await this.store.findById(id);
    if (
      !row ||
      row.notifiableType !== owner.notifiableType ||
      row.notifiableId !== owner.notifiableId ||
      (owner.tenantId !== undefined && row.tenantId !== owner.tenantId)
    ) {
      throw new NotFoundException();
    }
  }

  /** Warn once per process — this is a store capability gap, not a per-request condition. */
  private warnUnenforceable(operation: string): void {
    if (NotificationsQueryService.warnedUnenforceable) return;
    NotificationsQueryService.warnedUnenforceable = true;
    this.logger.warn(
      [
        `${this.store.constructor.name} implements neither the ownership-scoped mutations`,
        '(deleteOwned/markAsReadOwned) nor findById, so ownership cannot be verified —',
        `${operation} is running unscoped and will act on any id, including notifications`,
        'belonging to other notifiables. Implement findById on the store to close this.',
      ].join(' '),
    );
  }

  /** Widen a {@link NotifiableRef} into the owner predicate the store methods take. */
  private ownerRef(ref: NotifiableRef, tenant: string | undefined): NotificationOwnerRef {
    return { notifiableType: ref.type, notifiableId: String(ref.id), tenantId: tenant };
  }

  private async allScoped(
    target: NotifiableTarget,
    tenant?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const ref = this.refOf(target);
    return this.store.getForNotifiable(ref.type, String(ref.id), tenant, types);
  }

  private async unreadScoped(
    target: NotifiableTarget,
    tenant?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const ref = this.refOf(target);
    return this.store.getUnread(ref.type, String(ref.id), tenant, types);
  }

  private async paginateScoped(
    target: NotifiableTarget,
    { page = 1, perPage = 20, types }: PaginateOptions,
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
        types,
      });
      return { items, meta: meta(total) };
    }

    // Fallback for stores without pushdown: fetch all rows and slice (correct, not scalable).
    const all = await this.allScoped(target, tenant, types);
    return {
      items: all.slice(offset, offset + safePerPage),
      meta: meta(all.length),
    };
  }

  private async unreadCountScoped(
    target: NotifiableTarget,
    tenant?: string,
    types?: string[],
  ): Promise<number> {
    return (await this.unreadScoped(target, tenant, types)).length;
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
