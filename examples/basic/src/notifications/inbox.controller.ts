import type { StoredNotification } from '@dudousxd/nestjs-notifications-database';
import {
  NotificationsQueryService,
  parseInboxListQuery,
  parseInboxTypeQuery,
} from '@dudousxd/nestjs-notifications-database';
import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  AckDto,
  ListNotificationsQueryDto,
  type NotificationDto,
  PaginatedNotificationsDto,
  UnreadCountDto,
  UnreadNotificationsDto,
  UnreadNotificationsQueryDto,
} from './inbox.dto';

/**
 * The in-app inbox REST API, written as a **static, decorated controller** (rather than the
 * library's `createNotificationsController` factory) so `nestjs-codegen` can discover it by static
 * AST and emit a typed client into `src/generated`. It delegates to `NotificationsQueryService`
 * from the database channel, and reads its query with the library's own `parseInboxListQuery` /
 * `parseInboxTypeQuery`, so it answers exactly like `createNotificationsController`: a bad
 * `page`/`size`, a sort other than `-createdAt`, an unknown filter or a removed param (`perPage`,
 * a bare `type`) is a 400.
 *
 * In a real app the current notifiable comes from auth (`req.user`); here it's a fixed demo user.
 */
@Controller('notifications')
export class NotificationsInboxController {
  constructor(private readonly notifications: NotificationsQueryService) {}

  @Get()
  async list(@Query() query: ListNotificationsQueryDto): Promise<PaginatedNotificationsDto> {
    // Query values arrive as strings: the library's parser validates and clamps them (size ≤ 100).
    const parsed = parseInboxListQuery(query as Record<string, unknown>);
    const page = await this.notifications.paginate(this.currentUser(), parsed);
    return { data: page.data.map(toDto), meta: page.meta };
  }

  @Get('unread')
  async unread(@Query() query: UnreadNotificationsQueryDto): Promise<UnreadNotificationsDto> {
    const filter = parseInboxTypeQuery(query as Record<string, unknown>);
    const rows = await this.notifications.unread(this.currentUser(), filter);
    return { data: rows.map(toDto) };
  }

  @Get('unread/count')
  async unreadCount(@Query() query: UnreadNotificationsQueryDto): Promise<UnreadCountDto> {
    const filter = parseInboxTypeQuery(query as Record<string, unknown>);
    return { count: await this.notifications.unreadCount(this.currentUser(), filter) };
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
