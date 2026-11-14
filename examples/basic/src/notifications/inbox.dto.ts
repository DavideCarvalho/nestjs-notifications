/**
 * Plain DTO classes describing the in-app inbox API. `nestjs-codegen` reads these off the
 * controller's `@Query()`/`@Param()` params and method return types (static AST — no decorators
 * required) to emit a fully typed client. Keeping them as their own classes gives the generated
 * client clean, self-contained types instead of leaking the library's internal store types.
 */

/** A single notification as the inbox API returns it. */
export class NotificationDto {
  id!: string;
  /** Notification class name, e.g. "InvoicePaid". */
  type!: string;
  /** Arbitrary payload from `toDatabase()`. */
  data!: Record<string, unknown>;
  /** ISO timestamp, or null when unread. */
  readAt!: string | null;
  /** ISO timestamp. */
  createdAt!: string;
}

/**
 * Query string for the paginated list endpoint (Aviary list API): `?page=2&size=20` and
 * `?filter[type]=A,B`. Nest 12 on Express 5 parses the query flat, so the filter arrives under
 * the literal `filter[type]` key — the same key the generated client sends.
 */
export class ListNotificationsQueryDto {
  page?: number;
  size?: number;
  'filter[type]'?: string;
}

/** Offset paging metadata. Pages are 1-based. */
export class PageMetaDto {
  total!: number;
  perPage!: number;
  currentPage!: number;
  lastPage!: number;
  firstPage!: number;
}

/** One page of notifications: `{ data, meta }`. */
export class PaginatedNotificationsDto {
  data!: NotificationDto[];
  meta!: PageMetaDto;
}

/** The unread notifications: `{ data }`. */
export class UnreadNotificationsDto {
  data!: NotificationDto[];
}

/** The unread badge count. */
export class UnreadCountDto {
  count!: number;
}

/** A simple acknowledgement for mutating endpoints. */
export class AckDto {
  ok!: boolean;
}
