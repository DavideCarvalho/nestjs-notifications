# @dudousxd/nestjs-notifications-diagnostics

## 0.2.0

### Minor Changes

- [#129](https://github.com/DavideCarvalho/nestjs-notifications/pull/129) [`d7fcbe6`](https://github.com/DavideCarvalho/nestjs-notifications/commit/d7fcbe69693ba2894793d01ad0ed875ce4bd1f74) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Breaking:** require Node.js 24 or newer. Every package now declares `engines.node` `>=24` (none declared it before). CI tests on Node 24 and 26.

  Also removed (see Reference → Upgrading in the docs):

  - `@dudousxd/nestjs-notifications-core`: the `TenantScopedNotifier` type, a deprecated alias of `ScopedNotifier`. Rename it.

## 0.1.2

### Patch Changes

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.

## 0.1.1

### Patch Changes

- c68e5b3: Add NestJS 12 to the supported peer range.

  Every `@nestjs/*` peer that read `^10.0.0 || ^11.0.0` now also admits `^12.0.0`, and the
  `@nestjs/event-emitter` peer — which NestJS 12 renumbered from the 3.x line onto the framework's
  own 12.x line — reads `^2.0.0 || ^3.0.0 || ^12.0.0`. Installing on NestJS 12 no longer trips a peer
  warning; hosts on 10 or 11 are unaffected.

  The satellite peers move with it: `@nestjs/websockets` and `@nestjs/platform-socket.io`
  (broadcast), `@nestjs/bullmq` (bullmq) and `@nestjs/typeorm` (database-typeorm) all have a 12.x
  release, so none of them holds a package back.

  One source change was needed, in `sse`. NestJS 12 widened `MessageEvent['data']` to include
  `undefined`, so under `exactOptionalPropertyTypes` the hub's cast no longer satisfied the
  `Subject<MessageEvent>` it feeds; the cast is now `NonNullable<MessageEvent['data']>`. Runtime
  behaviour is unchanged — the backplane never publishes an undefined payload.

  Nothing else in the source needed touching. NestJS 12 ships its core packages as pure ESM and these
  libraries are already `"type": "module"`, and none of them implements a `PipeTransform` or
  subclasses `ConsoleLogger` — the two v12 signature changes that would otherwise have reached
  library code. The test suite runs against `@nestjs/common` 12.0.1.

## 0.1.0

### Minor Changes

- b6cd69f: Add `@dudousxd/nestjs-notifications-diagnostics`: bridge the core notification lifecycle events onto the Aviary diagnostics bus (`aviary:notifications:{sending,sent,failed}`). Ships `attachNotificationsDiagnostics(emitter)`, a global `NotificationsDiagnosticsModule`, and a typed `ChannelRegistry` augmentation so `@OnDiagnostic('notifications', ...)` infers the event-class payload. Propagates `captured.traceId` onto the diagnostic envelope.
