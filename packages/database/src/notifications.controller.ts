import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import {
  type CanActivate,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  type Type,
  UseGuards,
} from '@nestjs/common';
import { type InboxMountOrigin, recordInboxMount } from './inbox-registry';
import type { PaginatedNotifications } from './notifications-query.service';
import { NotificationsQueryService } from './notifications-query.service';

/** Options for {@link createNotificationsController}. */
export interface NotificationsControllerOptions {
  /**
   * Resolves the current notifiable from the request (e.g. from `req.user`). May be async.
   */
  resolveRef: (req: any) => NotifiableRef | Promise<NotifiableRef>;
  /** Controller base path. Default `'notifications'`. */
  path?: string | undefined;
  /**
   * Guards to protect the endpoints with (e.g. your auth guard). Applied via `@UseGuards` — the
   * inbox is per-user, so it should almost always be authenticated.
   */
  guards?: Array<Type<CanActivate> | CanActivate> | undefined;
}

/**
 * Builds a `@Controller('notifications')` exposing the in-app inbox endpoints:
 *
 * - `GET /notifications` — list (`?page&perPage` paginates, `?type=` filters)
 * - `GET /notifications/unread` (`?type=` filters)
 * - `GET /notifications/unread/count` (`?type=` filters)
 * - `POST /notifications/:id/read`
 * - `POST /notifications/read-all`
 * - `DELETE /notifications/:id`
 *
 * `?type=` accepts a comma-separated list of notification types (e.g.
 * `?type=FILE_EXPORT_RUNNING,PRIBUY_FILE_EXPORT_RUNNING`); entries are trimmed and blanks are
 * dropped. Absent or empty after parsing = no type filter (matches every type).
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
 *   imports: [DatabaseChannelModule.forFeature({ controller: false })],
 *   controllers: [NotificationsController],
 * })
 * export class InboxModule {}
 * ```
 *
 * **Pass `controller: false`** when you mount it yourself, as above. The module's `controller`
 * option defaults to `true`, so building your own controller does not replace the auto-mounted
 * one — without `controller: false` you get both, and the auto-mounted one carries the module's
 * `resolveRef` and guards rather than the ones passed here.
 */
export function createNotificationsController(
  options: NotificationsControllerOptions,
): Type<unknown> {
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
      @Query('page') page?: string,
      @Query('perPage') perPage?: string,
      @Query('type') type?: string,
    ): Promise<PaginatedNotifications> {
      const ref = await options.resolveRef(req);
      return this.notifications.paginate(ref, {
        page: page ? Number(page) : undefined,
        perPage: perPage ? Number(perPage) : undefined,
        types: parseTypesParam(type),
      });
    }

    @Get('unread')
    async unread(@Req() req: any, @Query('type') type?: string) {
      const ref = await options.resolveRef(req);
      return this.notifications.unread(ref, { types: parseTypesParam(type) });
    }

    @Get('unread/count')
    async unreadCount(@Req() req: any, @Query('type') type?: string): Promise<{ count: number }> {
      const ref = await options.resolveRef(req);
      return { count: await this.notifications.unreadCount(ref, { types: parseTypesParam(type) }) };
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

  if (options.guards && options.guards.length > 0) {
    UseGuards(...options.guards)(NotificationsController);
  }

  return NotificationsController;
}

/**
 * Parses a `?type=A,B` query param into a trimmed, non-empty list of types. Splits on commas,
 * trims whitespace, and drops empty entries. Returns `undefined` when `raw` is absent or resolves
 * to no entries — callers treat that as "no filter" (matches every type).
 */
function parseTypesParam(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const types = raw
    .split(',')
    .map((type) => type.trim())
    .filter((type) => type.length > 0);
  return types.length > 0 ? types : undefined;
}
