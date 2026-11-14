import type { StoredNotification } from '@dudousxd/nestjs-notifications-database';
import { NotificationsQueryService } from '@dudousxd/nestjs-notifications-database';
import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  AckDto,
  ListNotificationsQueryDto,
  type NotificationDto,
  PaginatedNotificationsDto,
  UnreadCountDto,
  UnreadNotificationsDto,
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
    // Query values arrive as strings; `size` is capped at 100 like the library's own controller.
    const page = await this.notifications.paginate(this.currentUser(), {
      page: query.page ? Number(query.page) : 1,
      size: Math.min(100, query.size ? Number(query.size) : 20),
      types: typeFilter(query['filter[type]']),
    });
    return { data: page.data.map(toDto), meta: page.meta };
  }

  @Get('unread')
  async unread(): Promise<UnreadNotificationsDto> {
    const rows = await this.notifications.unread(this.currentUser());
    return { data: rows.map(toDto) };
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

/** `filter[type]=A,B` → `['A', 'B']`; absent or empty → no filter. */
function typeFilter(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const types = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return types.length > 0 ? types : undefined;
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
