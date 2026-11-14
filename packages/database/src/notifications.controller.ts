import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { Controller, Delete, Get, Param, Post, Query, Req, type Type } from '@nestjs/common';
import { finishController, rejectRemovedGuards } from './controller-decorators';
import { type InboxMountOrigin, recordInboxMount } from './inbox-registry';
import type { StoredNotification } from './interfaces';
import { ListQueryError, parseFilterParams, parsePageParams, resolveSort } from './list-api';
import type { PaginatedNotifications } from './notifications-query.service';
import { NotificationsQueryService } from './notifications-query.service';

/** Options for {@link createNotificationsController}. */
export interface NotificationsControllerOptions {
  /**
   * Resolves the current notifiable from the request (e.g. from `req.user`). May be async.
   * Every route is scoped to the ref it returns; throw (e.g. `UnauthorizedException`) when the
   * request carries no identity.
   */
  resolveRef: (req: any) => NotifiableRef | Promise<NotifiableRef>;
  /** Controller base path. Default `'notifications'`. */
  path?: string | undefined;
  /**
   * Class decorators applied to the controller, in order, after its own — how you decide who
   * reaches it (e.g.
   * `[UseGuards(AuthenticationGuard), Can(InboxPolicy, 'read')]` with `@nestjs/authorization`).
   * The controller is marked open to `@nestjs/authorization`'s deny-by-default guard
   * (`Can.Anyone()`), so it answers without any; a `@Can()` passed here is still enforced.
   */
  decorators?: ClassDecorator[] | undefined;
}

/**
 * Builds a `@Controller('notifications')` exposing the in-app inbox endpoints:
 *
 * - `GET /notifications` — offset-paged list (`?page&size`, `?sort=-createdAt`, `?filter[type]=`),
 *   answering `{ data, meta: { total, perPage, currentPage, lastPage, firstPage } }`
 * - `GET /notifications/unread` (`?filter[type]=`), answering `{ data }`
 * - `GET /notifications/unread/count` (`?filter[type]=`), answering `{ count }`
 * - `POST /notifications/:id/read`
 * - `POST /notifications/read-all`
 * - `DELETE /notifications/:id`
 *
 * These follow the Aviary list API: `size` defaults to 20 and is clamped to 100; the only order
 * is newest first, so `sort` accepts only `-createdAt`. `filter[type]` takes one type, a comma
 * list (`filter[type]=A,B`) or repeated values (`filter[type][]=A&filter[type][]=B`). An unknown
 * filter field or operator, a bad `page`/`size` or any other `sort` answers `400`.
 *
 * The two per-id mutations (`:id/read` and `DELETE /:id`) are scoped to the notifiable `resolveRef`
 * returns — a notification belonging to someone else responds `404`, not `403`, so the endpoint
 * can't be used to probe which ids exist.
 *
 * Mount it by adding the returned class to a module's `controllers`, alongside
 * `DatabaseChannelModule` (which provides {@link NotificationsQueryService}):
 *
 * ```ts
 * const NotificationsController = createNotificationsController({
 *   resolveRef: (req) => ({ type: 'User', id: req.user.id }),
 * });
 *
 * @Module({
 *   imports: [DatabaseChannelModule.forFeature({ routes: false })],
 *   controllers: [NotificationsController],
 * })
 * export class InboxModule {}
 * ```
 *
 * **Pass `routes: false`** when you mount it yourself, as above. The module's `routes` option
 * defaults to `true`, so building your own controller does not replace the auto-mounted one —
 * without `routes: false` you get both, and the auto-mounted one carries the module's
 * `resolveRef` and `decorators` rather than the ones passed here.
 */
export function createNotificationsController(
  options: NotificationsControllerOptions,
): Type<unknown> {
  rejectRemovedGuards(options, 'createNotificationsController()');
  return buildNotificationsController(options, 'manual');
}

/**
 * Builds the inbox controller and records the mount so {@link import('./inbox-mount-audit')
 * .InboxMountAudit} can detect an app that both auto-mounts and hand-mounts the inbox.
 *
 * @internal Not exported from the package entry point — `origin` is how `DatabaseChannelModule`
 * distinguishes its auto-mount from an application's own `createNotificationsController()` call.
 */
export function buildNotificationsController(
  options: NotificationsControllerOptions,
  origin: InboxMountOrigin,
): Type<unknown> {
  const path = options.path ?? 'notifications';
  recordInboxMount({ path, origin });

  @Controller(path)
  class NotificationsController {
    constructor(private readonly notifications: NotificationsQueryService) {}

    @Get()
    async list(
      @Req() req: any,
      @Query() query: Record<string, unknown>,
    ): Promise<PaginatedNotifications> {
      const ref = await options.resolveRef(req);
      const { page, size } = parsePageParams(query, { defaultSize: 20, maxSize: 100 });
      assertNewestFirst(query.sort);
      const types = parseTypeFilter(query);
      return this.notifications.paginate(ref, { page, size, types });
    }

    @Get('unread')
    async unread(
      @Req() req: any,
      @Query() query: Record<string, unknown>,
    ): Promise<{ data: StoredNotification[] }> {
      const ref = await options.resolveRef(req);
      const types = parseTypeFilter(query);
      return { data: await this.notifications.unread(ref, { types }) };
    }

    @Get('unread/count')
    async unreadCount(
      @Req() req: any,
      @Query() query: Record<string, unknown>,
    ): Promise<{ count: number }> {
      const ref = await options.resolveRef(req);
      const types = parseTypeFilter(query);
      return { count: await this.notifications.unreadCount(ref, { types }) };
    }

    @Post(':id/read')
    async markAsRead(@Req() req: any, @Param('id') id: string): Promise<void> {
      // Pass the resolved ref so a cross-device read event is broadcast to the user's devices.
      const ref = await options.resolveRef(req);
      await this.notifications.markAsRead(id, ref);
    }

    @Post('read-all')
    async markAllAsRead(@Req() req: any): Promise<void> {
      const ref = await options.resolveRef(req);
      await this.notifications.markAllAsRead(ref);
    }

    @Delete(':id')
    async remove(@Req() req: any, @Param('id') id: string): Promise<void> {
      // Pass the resolved ref so the delete is scoped to the caller's own notifications —
      // without it any id could be deleted by anyone able to reach the endpoint.
      const ref = await options.resolveRef(req);
      await this.notifications.delete(id, ref);
    }
  }

  finishController(NotificationsController, options.decorators);

  return NotificationsController;
}

/**
 * Reads `filter[type]` (one type, `A,B`, or `filter[type][]=A&filter[type][]=B`) into a list of
 * types. Returns `undefined` when absent — "no filter" (matches every type). Any other filter
 * field or operator throws a `ListQueryError` (400).
 */
function parseTypeFilter(query: Record<string, unknown>): string[] | undefined {
  const filters = parseFilterParams(query, { fields: { type: ['eq', 'in'] } });
  const types = filters.flatMap((filter) =>
    Array.isArray(filter.value) ? filter.value : [filter.value],
  );
  const cleaned = types.map((type) => type.trim()).filter((type) => type.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** The store has one fixed order (newest first), so `sort` may only ask for `-createdAt`. */
function assertNewestFirst(raw: unknown): void {
  const sort = resolveSort(raw, { sortable: ['createdAt'], default: '-createdAt' });
  if (sort.length !== 1 || sort[0]?.direction !== 'desc') {
    throw new ListQueryError('Unsupported "sort": notifications are ordered by "-createdAt" only.');
  }
}
