# `@dudousxd/nestjs-notifications-diagnostics` — Design Spec

**Date:** 2026-06-19
**Status:** Approved (design), pending implementation plan
**Repo:** `nestjs-notifications` (new `packages/diagnostics` package)

## Goal

Bridge `nestjs-notifications`'s per-channel delivery events onto the Aviary diagnostics bus
(`@dudousxd/nestjs-diagnostics`) on **`aviary:notifications:<event>`** channels — so a single
`@OnDiagnostic('notifications', 'failed')` handler, the diagnostics-telescope watcher, or any
`getChannel('notifications', …).subscribe(...)` reacts to notification lifecycle with zero extra
dependencies. This is the second (and final) onboarding of roadmap item #2 — durable shipped first
(`@dudousxd/nestjs-durable-diagnostics`); this mirrors it for notifications. With both onboarded, one
`@OnDiagnostic` subscriber hears the whole Aviary ecosystem (resilience, authz, context, inertia,
durable, notifications).

Additive: the existing telescope and delivery-tracking integrations subscribe to the same
`@nestjs/event-emitter` events independently and are untouched.

## Background & constraints

- **Event source — `EventEmitter2`** (`@nestjs/event-emitter`). The core `ChannelRunner`
  (`packages/core/src/channel-runner.ts`) emits three events through an injected `EventEmitter2`
  during per-channel delivery:
  - `notification.sending` (`channel-runner.ts:153`) → `NotificationSendingEvent`
  - `notification.sent` (`channel-runner.ts:167`) → `NotificationSentEvent`
  - `notification.failed` (`channel-runner.ts:258`) → `NotificationFailedEvent`
  Names are the `NotificationEvents` constants (`packages/core/src/tokens.ts`:
  `{ sending: 'notification.sending', sent: 'notification.sent', failed: 'notification.failed' }`).
- **Event classes** (`packages/core/src/events.ts`) — all carry
  `notifiable, notification, channel, tenant?`; `sent` adds `durationMs?, response?`; `failed` adds
  `error, durationMs?`; all carry `captured?: CapturedContext`. `CapturedContext`
  (`packages/core/src/context-accessor.ts:37`) is `{ causer?, tenantId?, traceId? }` — the
  correlation/trace id of the triggering request, when `nestjs-context` is present.
- **Diagnostics emit — `emit(lib, event, payload, opts?)`** (`@dudousxd/nestjs-diagnostics`).
  Publishes a `DiagnosticEvent { v, ts, lib, event, traceId?, payload }` on `aviary:<lib>:<event>`.
  **Zero-cost when no one is subscribed** (short-circuits on `hasSubscribers` before allocation) and
  **never throws**. Arbitrary `lib`/`event` strings accepted; a `ChannelRegistry` declaration-merge
  upgrades a pair to a typed payload. `opts.traceId` overrides the ambient trace resolver.
- **Integration seam already exists — no core change needed.** The telescope watcher and
  delivery-tracking listener both resolve `EventEmitter2` via
  `ModuleRef.get(EventEmitter2, { strict: false })` and register listeners with `emitter.on(name, …)`.
  The bridge does exactly this. Prerequisite (same as those packages): the host app imports
  `EventEmitterModule.forRoot()` — `ChannelRunner` constructor-injects `EventEmitter2`, so it is
  always present when notifications runs.
- **Build:** tsup dual ESM+CJS, `moduleResolution: Bundler`, Turborepo — **mirror `packages/telescope`
  / `packages/delivery-tracking`**. Tests run under the repo-root `vitest.config.ts` (`pnpm exec
  vitest run <path>`): swc supplies decorator metadata, `vitest.setup.ts` imports `reflect-metadata`,
  and `workspaceSourceAliases()` auto-globs `packages/*` (so the new package resolves to its `src`
  with no dist build — no per-package vitest config, no manual alias registration).

**Reference implementations:**
- `packages/delivery-tracking/src/delivery-tracking.listener.ts` — the `ModuleRef` resolve +
  `emitter.on(NotificationEvents.*)` + never-throw (`safeRecord`) pattern, and its
  `DeliveryTrackingModule.forRoot()` shape.
- `@dudousxd/nestjs-durable-diagnostics` (the package just shipped in nestjs-durable) — the exact
  three-surface shape (attach primitive + Nest module + typed `ChannelRegistry` augmentation),
  including the tsc-enforced augmentation guard and the mocked-bridge shutdown test.
- `packages/telescope/{package.json,tsup.config.ts,tsconfig.json}` — the packaging template.

## Decision: package shape

A **new package `@dudousxd/nestjs-notifications-diagnostics`** (`packages/diagnostics`), mirroring the
durable-diagnostics package with one structural difference: the event source is a DI-provided
`EventEmitter2`, not a plain engine object. Three surfaces:

1. **`attachNotificationsDiagnostics(emitter)`** — the primitive. Registers the three listeners and
   re-emits each event over diagnostics; returns an unsubscribe that removes them. (Framework-free,
   directly testable with a real `EventEmitter2`.)
2. **`NotificationsDiagnosticsModule.forRoot()`** — a global Nest module that resolves `EventEmitter2`
   on init and calls `attachNotificationsDiagnostics`, detaching on destroy. Import it once and
   notifications is on the bus.
3. **Typed `ChannelRegistry` augmentation** — declares `notifications`'s three channels with their
   event-class payloads.

`@dudousxd/nestjs-diagnostics`, `@dudousxd/nestjs-notifications-core`, and `@nestjs/event-emitter`
are **peer dependencies**; `@nestjs/common` + `@nestjs/core` are peers (needed by the module).

## File structure

```
packages/diagnostics/
├── package.json            # mirrors packages/telescope/package.json
├── tsup.config.ts          # mirrors packages/telescope/tsup.config.ts (external list adjusted)
├── tsconfig.json           # identical to packages/telescope/tsconfig.json
├── README.md
└── src/
    ├── index.ts                              # exports attach + module; side-effect import of the registry
    ├── attach-notifications-diagnostics.ts   # attachNotificationsDiagnostics(emitter)
    ├── attach-notifications-diagnostics.spec.ts
    ├── notifications-diagnostics.module.ts   # NotificationsDiagnosticsModule
    ├── notifications-diagnostics.module.spec.ts
    ├── channel-registry.ts                   # ChannelRegistry declaration-merge
    └── channel-registry.type-test.ts         # tsc-checked guard (not a vitest spec)
```

Plus a changeset under `.changeset/` (minor; new package).

## Component 1 — `attachNotificationsDiagnostics(emitter)`

```ts
import {
  NotificationEvents,
  type NotificationSendingEvent,
  type NotificationSentEvent,
  type NotificationFailedEvent,
} from '@dudousxd/nestjs-notifications-core';
import { emit } from '@dudousxd/nestjs-diagnostics';
import type { EventEmitter2 } from '@nestjs/event-emitter';

type NotificationEvent =
  | NotificationSendingEvent | NotificationSentEvent | NotificationFailedEvent;

/** (core event name) → (diagnostics channel event segment). The `notification.` prefix is dropped
 *  so the channel reads `aviary:notifications:sent`, not `aviary:notifications:notification.sent`. */
const EVENT_MAP = [
  [NotificationEvents.sending, 'sending'],
  [NotificationEvents.sent, 'sent'],
  [NotificationEvents.failed, 'failed'],
] as const;

/**
 * Re-emit the core notification lifecycle events onto the Aviary diagnostics bus as
 * `aviary:notifications:{sending,sent,failed}`. The whole event instance is the payload; the
 * triggering request's `captured.traceId` (from nestjs-context, when present) is propagated onto the
 * diagnostics envelope. Zero-cost per event while no diagnostics subscriber is attached, and never
 * throws back into `@nestjs/event-emitter`. Additive to the telescope / delivery-tracking listeners.
 *
 * @returns an unsubscribe that removes the three listeners.
 */
export function attachNotificationsDiagnostics(emitter: EventEmitter2): () => void {
  const handlers = EVENT_MAP.map(([coreName, channelEvent]) => {
    const handler = (event: NotificationEvent): void => {
      const traceId = event.captured?.traceId;
      emit('notifications', channelEvent, event, traceId !== undefined ? { traceId } : undefined);
    };
    emitter.on(coreName, handler);
    return [coreName, handler] as const;
  });

  return () => {
    for (const [coreName, handler] of handlers) emitter.off(coreName, handler);
  };
}
```

- **Three events forwarded**, payload = the event instance. (`sending`/`sent`/`failed` are the only
  events the core emits; the `skipped/queued/deferred/suppressed/throttled` statuses are not events
  today — out of scope, see below.)
- **traceId propagation:** when the event carries `captured.traceId`, it is passed as `opts.traceId`
  so the diagnostic envelope correlates with the originating request trace. Built conditionally to
  satisfy `exactOptionalPropertyTypes` (never pass `{ traceId: undefined }`).
- **Never-throw:** `emit` is internally `try/catch`; reading `event.captured?.traceId` cannot throw.
  No extra wrapping needed — but the handler must stay this simple (no added logic that could throw
  into `EventEmitter2.emit`, which is synchronous for sync listeners).

## Component 2 — `NotificationsDiagnosticsModule`

```ts
import { Global, Module, type DynamicModule, Injectable, Logger,
  type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';

@Injectable()
class NotificationsDiagnosticsAttacher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsDiagnosticsAttacher.name);
  private off: (() => void) | null = null;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    let emitter: EventEmitter2 | null = null;
    try {
      emitter = this.moduleRef.get(EventEmitter2, { strict: false });
    } catch {
      emitter = null;
    }
    if (!emitter) {
      this.logger.warn(
        'EventEmitter2 not found — did you import EventEmitterModule.forRoot()? Notifications diagnostics are off.',
      );
      return;
    }
    this.off = attachNotificationsDiagnostics(emitter);
  }

  onModuleDestroy(): void {
    this.off?.();
    this.off = null;
  }
}

@Global()
@Module({})
export class NotificationsDiagnosticsModule {
  static forRoot(): DynamicModule {
    return { module: NotificationsDiagnosticsModule, providers: [NotificationsDiagnosticsAttacher] };
  }
}
```

- Resolves the already-provided `EventEmitter2` (`strict: false`, exactly like delivery-tracking),
  warns-and-no-ops if absent (full back-compat), attaches on init, detaches on destroy.
- Usage:
  ```ts
  @Module({ imports: [
    EventEmitterModule.forRoot(),
    NotificationsModule.forRoot({ /* ... */ }),
    NotificationsDiagnosticsModule.forRoot(),
  ] })
  export class AppModule {}
  ```

## Component 3 — `ChannelRegistry` augmentation (typed payloads)

```ts
import type {
  NotificationSendingEvent, NotificationSentEvent, NotificationFailedEvent,
} from '@dudousxd/nestjs-notifications-core';

declare module '@dudousxd/nestjs-diagnostics' {
  interface ChannelRegistry {
    notifications: {
      sending: NotificationSendingEvent;
      sent: NotificationSentEvent;
      failed: NotificationFailedEvent;
    };
  }
}
```

Imported as a side-effect from the barrel so consumers get
`@OnDiagnostic('notifications', 'failed')` and `getChannel('notifications', 'failed')` typed to the
matching event class. Guarded by a tsc-checked `channel-registry.type-test.ts` (a positive `emit`
acceptance + a `@ts-expect-error` negative that fails to compile if the augmentation is removed) —
exactly as durable-diagnostics does. The augmentation file is type-checked (`tsc` includes
`src/**`, excludes `*.spec.ts`) and never shipped (tsup bundles only `index.ts`).

## Public exports (`src/index.ts`)

```ts
export { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';
export { NotificationsDiagnosticsModule } from './notifications-diagnostics.module';
import './channel-registry'; // side-effect: registers the typed notifications channels
```

## Testing

Tests use a **real `EventEmitter2`** and a real diagnostics channel subscription; reset diagnostics
state between tests (`resetRegistry()`) and unsubscribe channels / remove emitter listeners in
`afterEach`.

**`attach-notifications-diagnostics.spec.ts`:**
- subscribing `getChannel('notifications', 'sent')` then `emitter.emit(NotificationEvents.sent, new
  NotificationSentEvent(...))` delivers a `DiagnosticEvent` whose `payload` is the event instance
  (`channel`, `durationMs` present);
- a `notification.failed` emission reaches `aviary:notifications:failed` carrying `payload.error`;
- **traceId propagation:** an event with `captured: { traceId: 't-1' }` produces a `DiagnosticEvent`
  with `traceId === 't-1'`; an event without `captured` still emits (envelope `traceId` falls back to
  the ambient resolver — assert the payload arrives, not the absence of a trace);
- the returned unsubscribe removes the listeners (a later `emitter.emit` yields no channel message);
- **never-throw / zero-cost:** with no channel subscriber, emitting an event does not throw and the
  emitter returns normally.

**`channel-registry.type-test.ts`** (tsc-checked, not a vitest spec): a positive
`emit('notifications', 'sent', sentEvent)` and a `// @ts-expect-error` `emit('notifications', 'sent',
123)` — proven to fail typecheck if the augmentation is removed.

**`notifications-diagnostics.module.spec.ts`** (`@nestjs/testing`): mock
`attachNotificationsDiagnostics` (via `vi.hoisted` + `vi.mock`) to isolate the module's
responsibility from the bridge's behavior (the latter covered by the attach spec). A Nest app
importing `EventEmitterModule.forRoot()` + `NotificationsDiagnosticsModule.forRoot()`:
- on init, `attachSpy` is called once with the container's `EventEmitter2`;
- on `moduleRef.close()`, the returned unsubscribe (`offSpy`) is called once
  (prove it guards: a no-op `onModuleDestroy` makes this fail).
- A separate, un-mocked test asserts the warn-and-no-op path when `EventEmitterModule` is absent does
  not throw at init.

## Build & packaging

- `package.json`: mirror `packages/telescope/package.json`; name
  `@dudousxd/nestjs-notifications-diagnostics`, `directory: "packages/diagnostics"`, description
  "Aviary diagnostics bus integration for nestjs-notifications — every send/sent/failed on
  `aviary:notifications:*`". `peerDependencies`: `@dudousxd/nestjs-notifications-core`
  (`>=0.1.0 <1.0.0`), `@dudousxd/nestjs-diagnostics` (`^0.3.0`), `@nestjs/common` + `@nestjs/core`
  (`^10 || ^11`), `@nestjs/event-emitter` (`^2 || ^3`). `devDependencies` mirror telescope's set plus
  `@dudousxd/nestjs-diagnostics@^0.3.0`. `version: 0.0.0`.
- `tsup.config.ts`: copy telescope's, with `external` =
  `['@dudousxd/nestjs-notifications-core', '@dudousxd/nestjs-diagnostics', '@nestjs/common',
  '@nestjs/core', '@nestjs/event-emitter', 'reflect-metadata']`.
- `tsconfig.json`: identical to telescope's.
- Changeset: new package → minor.
- README: install, `NotificationsDiagnosticsModule.forRoot()` snippet (with the
  `EventEmitterModule.forRoot()` prerequisite), the channel-name table (sending/sent/failed → event
  class), a `getChannel('notifications', 'failed').subscribe(...)` example (works today) and the
  `@OnDiagnostic('notifications', 'failed')` example (with a note it needs the diagnostics `/nestjs`
  subpath), and a note that it is additive to telescope / delivery-tracking.

## Out of scope (v1)

- **Emitting the non-event statuses** (`skipped/queued/deferred/suppressed/throttled`) — these are
  `ChannelResult.status` values today, not `@nestjs/event-emitter` events. Adding events for them is
  a core change, a separate item. The bridge forwards only what the core emits.
- **Cross-process transport** — diagnostics stays in-process; a consumer-side forwarder is a later
  roadmap item.
- **Aviary docs page** for the new package — add after the build lands (notifications docs are synced
  into the Aviary site; a `diagnostics` integration page mirrors the existing `telescope` one).
