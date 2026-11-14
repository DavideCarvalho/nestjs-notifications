---
'@dudousxd/nestjs-notifications-database': minor
---

The inbox controller's list endpoints move to the Aviary list API. Breaking for HTTP clients and for `paginate()` callers:

- `GET /notifications` takes `page` (1-based) and `size` (default 20, clamped to 100), `sort` (only `-createdAt`) and `filter[type]` (one type, `A,B`, or `filter[type][]=A&filter[type][]=B`). It answers `{ data, meta: { total, perPage, currentPage, lastPage, firstPage } }`. `perPage` and `?type=` are gone: they, and any other param the endpoint does not read, answer `400` naming the replacement (`size`, `filter[type]`) instead of being ignored. An empty `sort` is the default order.
- `GET /notifications/unread` takes `filter[type]` and answers `{ data }` instead of a bare array.
- `GET /notifications/unread/count` takes `filter[type]` instead of `?type=`.
- An unknown filter field or operator, a bad `page`/`size`, or any other `sort` answers `400`.
- `NotificationsQueryService.paginate()` takes `{ page, size, types }` and returns the same `{ data, meta }` envelope. `PaginatedNotifications` / `PaginationMeta` change shape accordingly. `ListQueryError`, `OffsetPage` and `OffsetPageMeta` are exported.

New exports `parseInboxListQuery(query)` and `parseInboxTypeQuery(query)` read an inbox request exactly like the built-in controller (same 400s), for a hand-written inbox controller such as the codegen-friendly one in `examples/basic`.
