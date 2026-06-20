# @dudousxd/nestjs-notifications-react

## 0.8.1

### Patch Changes

- 94c52f3: Fix "React is not defined" in the built bundle. tsup/esbuild compiled the package's JSX with the classic runtime (`React.createElement`) but never imported React, so consuming it from a modern automatic-runtime app bundle threw `React is not defined` at module load. Inject a React shim at build time so every `React` reference resolves to an import from the (peer) `react`, making the output self-contained.

## 0.8.0

### Minor Changes

- 0048cb5: Ecosystem-wide improvements across reliability, delivery, localization, and packaging.

  ## ⚠️ Breaking-ish: `ChannelContext` payload signature

  Channel payload methods now receive a `ChannelContext` argument. Methods such as
  `toMail(notifiable)` become `toMail(notifiable, ctx)` / `toMail(ctx)` — the channel
  payload method signature has changed. This is the one source-level change consumers
  must adapt to. Because the ecosystem is still pre-1.0 (alpha), this is shipped as a
  **minor** bump rather than a major. Update any custom channel payload methods
  (`toMail`, `toSms`, `toPush`, `toSlack`, `toDiscord`, `toTelegram`, `toTeams`,
  `toWebhook`, `toBroadcast`, etc.) to accept the new `ChannelContext`.

  ## Reliability & delivery
  - **Dedup / idempotency keys** — duplicate dispatches are collapsed via configurable idempotency keys.
  - **Throttle / rate-limiting** — per-channel/per-recipient throttling to protect downstream providers.
  - **Durable Redis dispatcher** — sorted-set backed queue with a dead-letter queue (DLQ) for failed jobs.
  - **Configurable BullMQ retry/backoff/DLQ** — tunable retry counts, backoff strategy, and DLQ routing.
  - **Push batch send + dead-token pruning** — batched push delivery with automatic pruning of dead/expired tokens.
  - **Generalized provider failover** — failover across providers for SMS, webhook, and Slack channels.
  - **Cross-channel fallback chains** — fall back to alternate channels when a primary channel fails.

  ## Scheduling & preferences
  - **Quiet hours + timezone** — suppress/defer delivery during recipient quiet hours, timezone-aware.
  - **REAL digest collection + flush** — actual pending-digest collection and scheduled flush, backed by
    pending-digest stores (in-memory / TypeORM / MikroORM / Prisma).

  ## Localization & sync
  - **i18n / localization** — `LocaleResolver` + `Translator` for localized notification content.
  - **Cross-device read-sync** — read state synchronized across a recipient's devices.

  ## Data layer
  - **DB-level pagination pushdown** — pagination is pushed down to the database instead of in-memory slicing.
  - **Cross-store contract tests** — shared contract test suites run against every store implementation, plus
    Postgres/MySQL testcontainers integration coverage.

  ## Packaging
  - **Dual ESM/CJS packaging** — all packages now ship both ESM and CJS builds (tsup), with a LICENSE per package.

### Patch Changes

- Updated dependencies [0048cb5]
  - @dudousxd/nestjs-notifications-client@0.7.0

## 0.7.0

### Minor Changes

- e7715d8: Add generic `progress` and `action` conventions to the inbox. New pure helpers
  `notificationProgress(item)` (reads a 0–100 `data.progress`, accepting numeric
  strings) and `notificationAction(item)` (reads `data.action: { label, url }` or
  flat `actionUrl`/`downloadUrl` + `actionLabel`) are exported for custom
  renderers, and the built-in `Inbox` row now renders a progress bar for
  long-running notifications and a download/action link when present.

## 0.6.1

### Patch Changes

- Updated dependencies [f710348]
  - @dudousxd/nestjs-notifications-client@0.6.0

## 0.6.0

### Minor Changes

- 461bcaf: `subscribeNotificationsStream` / `useNotificationsStream` now accept an optional `credentials` (`RequestCredentials`), forwarded to `fetch`. Defaults to `'include'` (unchanged behavior); pass `'same-origin'`/`'omit'` to opt out of sending cookies.

### Patch Changes

- Updated dependencies [461bcaf]
  - @dudousxd/nestjs-notifications-client@0.5.0

## 0.5.0

### Minor Changes

- 93bc116: Add an SSE stream subscription to the SDK — the one piece codegen can't generate (it does request/response, not streaming).

  - `subscribeNotificationsStream({ url, onUpdate, headers?, fetch?, ... })` (client): framework-agnostic core. Uses `fetch` (not `EventSource`) so requests carry auth headers, parses SSE frames, ignores heartbeats, and reconnects with exponential backoff. Returns an unsubscribe function.
  - `useNotificationsStream({ url, onUpdate, headers?, ... })` (react): thin React wrapper. Query-library agnostic — you decide what `onUpdate` does (e.g. invalidate TanStack queries), so the package gains no query-library dependency. Callbacks are read through refs, so fresh closures don't reconnect.

  The `headers: () => Record<string, string>` shape mirrors a fetch-client's dynamic-headers option, so you can pass the same auth function you give your HTTP client and configure credentials once.

### Patch Changes

- Updated dependencies [93bc116]
  - @dudousxd/nestjs-notifications-client@0.4.0

## 0.4.0

### Minor Changes

- a177275: Inbox pagination now uses a conventional `meta` envelope — `{ items, meta: { page, perPage, total, lastPage } }` — instead of flat `{ items, page, perPage, total }`. This matches the pagination shape nestjs-codegen's generated `infiniteQueryOptions()` expects, so a frontend gets working infinite scroll over the inbox with zero hand-written glue (and `lastPage` makes "has more" explicit). Breaking for readers of `PaginatedNotifications` — read `result.meta.*`.

### Patch Changes

- Updated dependencies [a177275]
  - @dudousxd/nestjs-notifications-client@0.3.0

## 0.3.0

### Minor Changes

- 39b9152: The React package now builds on the new framework-neutral `@dudousxd/nestjs-notifications-client` core: the `NotificationsClient`, types, and the new `createNotificationsClient` are re-exported from it (back-compatible), and the hooks/widget consume the shared client. For headless usage or TanStack Query, use the core (and its `/tanstack` subpath) directly.

### Patch Changes

- Updated dependencies [39b9152]
  - @dudousxd/nestjs-notifications-client@0.2.0

## 0.2.0

### Minor Changes

- 67db54f: New @dudousxd/nestjs-notifications-react package: drop-in <Inbox/> widget plus useNotifications / useUnreadCount hooks and a NotificationsProvider, consuming the read API and SSE stream.
