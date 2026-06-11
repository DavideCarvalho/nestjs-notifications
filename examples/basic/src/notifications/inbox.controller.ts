import type { StoredNotification } from '@dudousxd/nestjs-notifications-database';
import { NotificationsQueryService } from '@dudousxd/nestjs-notifications-database';
import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  AckDto,
  ListNotificationsQueryDto,
  type NotificationDto,
  PaginatedNotificationsDto,
  UnreadCountDto,
} from './inbox.dto';

/**
 * The in-app inbox REST API, written as a **static, decorated controller** (rather than the
 * library's `createNotificationsController` factory) so `nestjs-codegen` can discover it by static
 * AST and emit a typed client into `src/generated`. It delegates to `NotificationsQueryService`
 * from the database channel.
 *
 * In a real app the current notifiable comes from auth (`req.user`); here it's a fixed demo user.
 */
@Controller('notifications')
export class NotificationsInboxController {
  constructor(private readonly notifications: NotificationsQueryService) {}

  @Get()
  async list(@Query() query: ListNotificationsQueryDto): Promise<PaginatedNotificationsDto> {
    const page = await this.notifications.paginate(this.currentUser(), {
      page: query.page,
      perPage: query.perPage,
    });
    return {
      items: page.items.map(toDto),
      page: page.page,
      perPage: page.perPage,
      total: page.total,
    };
  }

  @Get('unread')
  async unread(): Promise<NotificationDto[]> {
    const items = await this.notifications.unread(this.currentUser());
    return items.map(toDto);
  }

  @Get('unread/count')
  async unreadCount(): Promise<UnreadCountDto> {
    return { count: await this.notifications.unreadCount(this.currentUser()) };
  }

  @Post(':id/read')
  async markAsRead(@Param('id') id: string): Promise<AckDto> {
    await this.notifications.markAsRead(id);
    return { ok: true };
  }

  @Post('read-all')
  async markAllAsRead(): Promise<AckDto> {
    await this.notifications.markAllAsRead(this.currentUser());
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<AckDto> {
    await this.notifications.delete(id);
    return { ok: true };
  }

  /** Stand-in for the authenticated notifiable — real apps derive this from the request. */
  private currentUser() {
    return { type: 'User', id: '1' };
  }
}

function toDto(n: StoredNotification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    data: n.data,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}
