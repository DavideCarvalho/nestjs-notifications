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
import type { PaginatedNotifications } from './notifications-query.service';
import { NotificationsQueryService } from './notifications-query.service';

/** Options for {@link createNotificationsController}. */
export interface NotificationsControllerOptions {
  /**
   * Resolves the current notifiable from the request (e.g. from `req.user`). May be async.
   */
  resolveRef: (req: any) => NotifiableRef | Promise<NotifiableRef>;
  /** Controller base path. Default `'notifications'`. */
  path?: string;
  /**
   * Guards to protect the endpoints with (e.g. your auth guard). Applied via `@UseGuards` — the
   * inbox is per-user, so it should almost always be authenticated.
   */
  guards?: Array<Type<CanActivate> | CanActivate>;
}

/**
 * Builds a `@Controller('notifications')` exposing the in-app inbox endpoints:
 *
 * - `GET /notifications` — list (`?page&perPage` paginates)
 * - `GET /notifications/unread`
 * - `GET /notifications/unread/count`
 * - `POST /notifications/:id/read`
 * - `POST /notifications/read-all`
 * - `DELETE /notifications/:id`
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
 *   imports: [DatabaseChannelModule.forFeature()],
 *   controllers: [NotificationsController],
 * })
 * export class InboxModule {}
 * ```
 */
export function createNotificationsController(
  options: NotificationsControllerOptions,
): Type<unknown> {
  @Controller(options.path ?? 'notifications')
  class NotificationsController {
    constructor(private readonly notifications: NotificationsQueryService) {}

    @Get()
    async list(
      @Req() req: any,
      @Query('page') page?: string,
      @Query('perPage') perPage?: string,
    ): Promise<PaginatedNotifications> {
      const ref = await options.resolveRef(req);
      return this.notifications.paginate(ref, {
        page: page ? Number(page) : undefined,
        perPage: perPage ? Number(perPage) : undefined,
      });
    }

    @Get('unread')
    async unread(@Req() req: any) {
      const ref = await options.resolveRef(req);
      return this.notifications.unread(ref);
    }

    @Get('unread/count')
    async unreadCount(@Req() req: any): Promise<{ count: number }> {
      const ref = await options.resolveRef(req);
      return { count: await this.notifications.unreadCount(ref) };
    }

    @Post(':id/read')
    async markAsRead(@Param('id') id: string): Promise<void> {
      await this.notifications.markAsRead(id);
    }

    @Post('read-all')
    async markAllAsRead(@Req() req: any): Promise<void> {
      const ref = await options.resolveRef(req);
      await this.notifications.markAllAsRead(ref);
    }

    @Delete(':id')
    async remove(@Param('id') id: string): Promise<void> {
      await this.notifications.delete(id);
    }
  }

  if (options.guards && options.guards.length > 0) {
    UseGuards(...options.guards)(NotificationsController);
  }

  return NotificationsController;
}
