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

/** Query string for the paginated list endpoint. */
export class ListNotificationsQueryDto {
  page?: number;
  perPage?: number;
}

/** One page of notifications. */
export class PaginatedNotificationsDto {
  items!: NotificationDto[];
  page!: number;
  perPage!: number;
  total!: number;
}

/** The unread badge count. */
export class UnreadCountDto {
  count!: number;
}

/** A simple acknowledgement for mutating endpoints. */
export class AckDto {
  ok!: boolean;
}
