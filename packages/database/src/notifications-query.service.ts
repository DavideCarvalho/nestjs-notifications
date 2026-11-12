import {
  CONTEXT_ACCESSOR,
  type Notifiable,
  type NotifiableRef,
  notifiableRef,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { NotificationOwnerRef, NotificationStore, StoredNotification } from './interfaces';
import { READ_SYNC_PUBLISHER, type ReadSyncPublisher } from './read-sync';
import { type InboxScope, type TenancyOption, inboxScope, readTenancy } from './tenancy';
import { DATABASE_TENANCY, NOTIFICATION_STORE } from './tokens';

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
 * With tenancy on (the module's `tenancy` option, which follows `@dudousxd/nestjs-context` by
 * default), calls without `forTenant` are scoped to the request's tenant, and a row of another
 * tenant reads as not found. An explicit `forTenant(id)` always wins.
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
  private static warnedTenantUnenforceable = false;

  /** Test seam: re-arm the once-per-process warning. */
  static resetOwnershipWarning(): void {
    NotificationsQueryService.warnedUnenforceable = false;
    NotificationsQueryService.warnedTenantUnenforceable = false;
  }

  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
    // Optional cross-device read-sync publisher (e.g. SSE-backed). Absent → no-op.
    @Optional()
    @Inject(READ_SYNC_PUBLISHER)
    private readonly readSync?: ReadSyncPublisher,
    // The nestjs-context accessor, read structurally. Absent → the global slot, else tenancy off.
    @Optional()
    @Inject(CONTEXT_ACCESSOR)
    private readonly contextAccessor?: unknown,
    @Optional()
    @Inject(DATABASE_TENANCY)
    private readonly tenancy: TenancyOption = 'inherit',
  ) {}

  /** Resolve the tenant scope of one call: the explicit tenant, else the context's (when on). */
  private scopeOf(explicit: string | undefined): InboxScope {
    return inboxScope(explicit, readTenancy(this.tenancy ?? 'inherit', this.contextAccessor));
  }

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
    explicitTenant: string | undefined,
  ): Promise<void> {
    const scope = this.scopeOf(explicitTenant);
    if (!target) {
      await this.assertTenantVisible(id, scope, 'markAsRead');
      await this.store.markAsRead(id);
      return;
    }
    const ref = this.refOf(target);
    const owner = this.ownerRef(ref, scope.tenant);
    await this.assertVisibleForOwner(id, ref, scope);
    if (this.store.markAsReadOwned) {
      if (!(await this.store.markAsReadOwned(id, owner))) throw new NotFoundException();
    } else {
      await this.assertOwned(id, owner, 'markAsRead');
      await this.store.markAsRead(id);
    }
    this.publishRead(ref, id, explicitTenant);
  }

  /** Delete, enforcing ownership when a `target` is given. See {@link markAsReadScoped}. */
  private async deleteScoped(
    id: string,
    target: NotifiableTarget | undefined,
    explicitTenant: string | undefined,
  ): Promise<void> {
    const scope = this.scopeOf(explicitTenant);
    if (!target) {
      await this.assertTenantVisible(id, scope, 'delete');
      await this.store.delete(id);
      return;
    }
    const ref = this.refOf(target);
    const owner = this.ownerRef(ref, scope.tenant);
    await this.assertVisibleForOwner(id, ref, scope);
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

  /**
   * The matching rule for a by-id mutation whose scope the store predicate can't express (rows
   * with no tenant). Reads the row, or finds it in the owner's feed when the store has no
   * `findById`, and answers `404` when the request may not see it.
   */
  private async assertVisibleForOwner(
    id: string,
    ref: NotifiableRef,
    scope: InboxScope,
  ): Promise<void> {
    if (!scope.visible) return;
    const row = this.store.findById
      ? await this.store.findById(id)
      : ((await this.store.getForNotifiable(ref.type, String(ref.id))).find((r) => r.id === id) ??
        null);
    if (!row || !scope.visible(row.tenantId)) throw new NotFoundException();
  }

  /**
   * The matching rule for an unscoped (no `target`) by-id mutation under a context tenant. Needs
   * `findById`; without it the tenant cannot be checked, which is warned about once.
   */
  private async assertTenantVisible(
    id: string,
    scope: InboxScope,
    operation: string,
  ): Promise<void> {
    if (!scope.fromContext) return;
    if (!this.store.findById) {
      if (!NotificationsQueryService.warnedTenantUnenforceable) {
        NotificationsQueryService.warnedTenantUnenforceable = true;
        this.logger.warn(
          `${this.store.constructor.name} does not implement findById, so the tenant of a notification cannot be checked when ${operation} is called without a target. Pass the owning notifiable, or implement findById on the store.`,
        );
      }
      return;
    }
    const row = await this.store.findById(id);
    if (!row) return; // unchanged: a missing id is a no-op for the unscoped mutation
    const visible = scope.visible
      ? scope.visible(row.tenantId)
      : scope.tenant === undefined || row.tenantId === scope.tenant;
    if (!visible) throw new NotFoundException();
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
    explicitTenant?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const scope = this.scopeOf(explicitTenant);
    const ref = this.refOf(target);
    return keep(
      await this.store.getForNotifiable(ref.type, String(ref.id), scope.tenant, types),
      scope,
    );
  }

  private async unreadScoped(
    target: NotifiableTarget,
    explicitTenant?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const scope = this.scopeOf(explicitTenant);
    const ref = this.refOf(target);
    return keep(await this.store.getUnread(ref.type, String(ref.id), scope.tenant, types), scope);
  }

  private async paginateScoped(
    target: NotifiableTarget,
    { page = 1, perPage = 20, types }: PaginateOptions,
    explicitTenant?: string,
  ): Promise<PaginatedNotifications> {
    const scope = this.scopeOf(explicitTenant);
    const safePage = Math.max(1, Math.floor(page));
    const safePerPage = Math.max(1, Math.floor(perPage));
    const offset = (safePage - 1) * safePerPage;
    const meta = (total: number): PaginationMeta => ({
      page: safePage,
      perPage: safePerPage,
      total,
      lastPage: Math.max(1, Math.ceil(total / safePerPage)),
    });

    // Push limit/offset down into the store when it supports it — scales to large feeds. A scope
    // the store predicate can't express (rows with no tenant) takes the in-memory path below.
    if (this.store.paginateForNotifiable && !scope.visible) {
      const ref = this.refOf(target);
      const { items, total } = await this.store.paginateForNotifiable(ref.type, String(ref.id), {
        limit: safePerPage,
        offset,
        tenantId: scope.tenant,
        types,
      });
      return { items, meta: meta(total) };
    }

    // Fallback for stores without pushdown: fetch all rows and slice (correct, not scalable).
    const all = await this.allScoped(target, explicitTenant, types);
    return {
      items: all.slice(offset, offset + safePerPage),
      meta: meta(all.length),
    };
  }

  private async unreadCountScoped(
    target: NotifiableTarget,
    explicitTenant?: string,
    types?: string[],
  ): Promise<number> {
    const scope = this.scopeOf(explicitTenant);
    if (this.store.countUnread && !scope.visible) {
      const ref = this.refOf(target);
      return this.store.countUnread(ref.type, String(ref.id), scope.tenant, types);
    }
    return (await this.unreadScoped(target, explicitTenant, types)).length;
  }

  private async markAllAsReadScoped(
    target: NotifiableTarget,
    explicitTenant?: string,
  ): Promise<void> {
    const scope = this.scopeOf(explicitTenant);
    const ref = this.refOf(target);
    if (scope.visible) {
      // The store's bulk update can't express "rows with no tenant": mark the visible rows one by one.
      const unread = keep(await this.store.getUnread(ref.type, String(ref.id)), scope);
      for (const row of unread) await this.store.markAsRead(row.id);
    } else {
      await this.store.markAllAsRead(ref.type, String(ref.id), scope.tenant);
    }
    // notificationId: null signals "all read" to the other devices. Published under the explicit
    // tenant only, the key the SSE channel delivers under.
    this.publishRead(ref, null, explicitTenant);
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

/** Apply a scope's row predicate, when it has one, to rows the store already narrowed. */
function keep(rows: StoredNotification[], scope: InboxScope): StoredNotification[] {
  const visible = scope.visible;
  return visible ? rows.filter((row) => visible(row.tenantId)) : rows;
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
