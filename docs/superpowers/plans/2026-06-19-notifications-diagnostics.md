# `@dudousxd/nestjs-notifications-diagnostics` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@dudousxd/nestjs-notifications-diagnostics` — re-emit the core notification lifecycle events (`sending`/`sent`/`failed`) onto the Aviary diagnostics bus (`aviary:notifications:<event>`), with a Nest module and a typed `ChannelRegistry` augmentation.

**Architecture:** A thin bridge subscribes to the three `@nestjs/event-emitter` events the core `ChannelRunner` emits and calls `emit('notifications', <event>, payload, { traceId })` for each. `attachNotificationsDiagnostics(emitter)` is the primitive; `NotificationsDiagnosticsModule` resolves `EventEmitter2` via `ModuleRef` and attaches on init / detaches on destroy. Mirrors `@dudousxd/nestjs-durable-diagnostics` and the `packages/delivery-tracking` listener. Additive — telescope/delivery-tracking untouched.

**Tech Stack:** TypeScript, tsup (dual ESM+CJS, `moduleResolution: Bundler`), vitest (root config, swc decorators), pnpm workspace + Turborepo. Peers: `@dudousxd/nestjs-notifications-core`, `@dudousxd/nestjs-diagnostics`, `@nestjs/event-emitter`, `@nestjs/common`, `@nestjs/core`.

**Spec:** `docs/superpowers/specs/2026-06-19-notifications-diagnostics-design.md`

## Global Constraints

- Package name `@dudousxd/nestjs-notifications-diagnostics`, directory `packages/diagnostics`.
- **Mirror `packages/telescope`** for `tsup.config.ts` (adjust the `external` list) and `tsconfig.json` (copy verbatim), and `package.json` structure (dual ESM+CJS `exports`, `main: ./dist/index.cjs`, `module: ./dist/index.js`, `types: ./dist/index.d.ts`).
- Channel event segments are the SHORT names — `sending`, `sent`, `failed` (drop the `notification.` prefix): `aviary:notifications:sent`, etc.
- Forward all THREE events the core emits; payload = the event instance. Propagate `event.captured?.traceId` as `emit` `opts.traceId` ONLY when defined (never pass `{ traceId: undefined }` — `exactOptionalPropertyTypes` is on).
- Peer ranges: `@dudousxd/nestjs-notifications-core` `">=0.1.0 <1.0.0"`, `@dudousxd/nestjs-diagnostics` `"^0.3.0"`, `@nestjs/common` + `@nestjs/core` `"^10.0.0 || ^11.0.0"`, `@nestjs/event-emitter` `"^2.0.0 || ^3.0.0"`.
- Specs run under the repo-root `vitest.config.ts` (`pnpm exec vitest run <path>`). Source aliases auto-glob `packages/*` (no manual registration); `vitest.setup.ts` imports `reflect-metadata`; swc supplies decorator metadata. Reset diagnostics state with `resetRegistry()` and remove emitter listeners / unsubscribe channels in `afterEach`.
- Every commit body ends with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Work in the worktree on branch `feat/notifications-diagnostics`.

---

### Task 1: Package scaffold + `attachNotificationsDiagnostics`

**Files:**
- Create: `packages/diagnostics/package.json`
- Create: `packages/diagnostics/tsup.config.ts`
- Create: `packages/diagnostics/tsconfig.json`
- Create: `packages/diagnostics/src/attach-notifications-diagnostics.ts`
- Create: `packages/diagnostics/src/index.ts`
- Test: `packages/diagnostics/src/attach-notifications-diagnostics.spec.ts`

**Interfaces:**
- Consumes: `NotificationEvents`, `NotificationSendingEvent`, `NotificationSentEvent`, `NotificationFailedEvent` from `@dudousxd/nestjs-notifications-core`; `emit`, `getChannel`, `resetRegistry`, `type DiagnosticEvent` from `@dudousxd/nestjs-diagnostics`; `EventEmitter2` from `@nestjs/event-emitter`.
- Produces: `attachNotificationsDiagnostics(emitter: EventEmitter2): () => void`.

- [ ] **Step 1: Scaffold the package files**

`packages/diagnostics/package.json`:

```json
{
  "name": "@dudousxd/nestjs-notifications-diagnostics",
  "version": "0.0.0",
  "description": "Aviary diagnostics bus integration for nestjs-notifications — every send/sent/failed on aviary:notifications:*",
  "license": "MIT",
  "author": "Davide Carvalho",
  "repository": {
    "type": "git",
    "url": "https://github.com/DavideCarvalho/nestjs-notifications.git",
    "directory": "packages/diagnostics"
  },
  "type": "module",
  "main": "./dist/index.cjs",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "keywords": [
    "nestjs",
    "notifications",
    "diagnostics",
    "observability",
    "aviary"
  ],
  "peerDependencies": {
    "@dudousxd/nestjs-notifications-core": ">=0.1.0 <1.0.0",
    "@dudousxd/nestjs-diagnostics": "^0.3.0",
    "@nestjs/common": "^10.0.0 || ^11.0.0",
    "@nestjs/core": "^10.0.0 || ^11.0.0",
    "@nestjs/event-emitter": "^2.0.0 || ^3.0.0"
  },
  "devDependencies": {
    "@dudousxd/nestjs-notifications-core": "workspace:^",
    "@dudousxd/nestjs-diagnostics": "^0.3.0",
    "@nestjs/common": "11.1.26",
    "@nestjs/core": "11.1.26",
    "@nestjs/event-emitter": "3.1.0",
    "@nestjs/testing": "11.1.26",
    "reflect-metadata": "0.2.2",
    "typescript": "5.9.3",
    "tsup": "8.3.5"
  },
  "module": "./dist/index.js",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  }
}
```

`packages/diagnostics/tsup.config.ts` (telescope's, with the diagnostics `external` list):

```ts
import { defineConfig } from 'tsup';

// Dual ESM + CJS build (mirrors packages/core). Two passes so the CJS pass emits an `index.d.cts`
// that a `require()` consumer resolves under NodeNext. esbuild honors `emitDecoratorMetadata` from
// tsconfig, so NestJS DI metadata survives in both outputs.
const external = [
  '@dudousxd/nestjs-notifications-core',
  '@dudousxd/nestjs-diagnostics',
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'reflect-metadata',
];

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    external,
  },
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    external,
  },
]);
```

`packages/diagnostics/tsconfig.json` (copy of `packages/telescope/tsconfig.json`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/**/*.spec.ts", "dist", "node_modules"]
}
```

- [ ] **Step 2: Install workspace deps**

Run from repo root: `pnpm install`
Expected: pnpm links the new package; `@dudousxd/nestjs-diagnostics`, `@nestjs/event-emitter`, `@nestjs/*` resolve.

- [ ] **Step 3: Write the failing test**

`packages/diagnostics/src/attach-notifications-diagnostics.spec.ts`:

```ts
import {
  NotificationEvents,
  NotificationFailedEvent,
  NotificationSentEvent,
  type Notifiable,
  type Notification,
} from '@dudousxd/nestjs-notifications-core';
import { type DiagnosticEvent, getChannel, resetRegistry } from '@dudousxd/nestjs-diagnostics';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterEach, describe, expect, it } from 'vitest';
import { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';

const notifiable = {} as Notifiable;
const notification = {} as Notification;

/** Subscribe to one notifications channel and collect the diagnostic envelopes it receives. */
function capture(event: string) {
  const seen: DiagnosticEvent[] = [];
  const listener = (msg: unknown) => seen.push(msg as DiagnosticEvent);
  const channel = getChannel('notifications', event);
  channel.subscribe(listener);
  return { seen, off: () => channel.unsubscribe(listener) };
}

describe('attachNotificationsDiagnostics', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    resetRegistry();
  });

  it('emits notification.sent on aviary:notifications:sent with the event as payload', () => {
    const emitter = new EventEmitter2();
    cleanups.push(attachNotificationsDiagnostics(emitter));
    const sent = capture('sent');
    cleanups.push(sent.off);

    emitter.emit(
      NotificationEvents.sent,
      new NotificationSentEvent(notifiable, notification, 'mail', 'tenant-1', 12, { id: 'p1' }),
    );

    expect(sent.seen.length).toBe(1);
    const payload = sent.seen[0]?.payload as NotificationSentEvent;
    expect(payload.channel).toBe('mail');
    expect(payload.durationMs).toBe(12);
  });

  it('emits notification.failed on aviary:notifications:failed carrying the error', () => {
    const emitter = new EventEmitter2();
    cleanups.push(attachNotificationsDiagnostics(emitter));
    const failed = capture('failed');
    cleanups.push(failed.off);

    emitter.emit(
      NotificationEvents.failed,
      new NotificationFailedEvent(notifiable, notification, 'sms', new Error('boom'), 'tenant-1', 5),
    );

    expect(failed.seen.length).toBe(1);
    const payload = failed.seen[0]?.payload as NotificationFailedEvent;
    expect((payload.error as Error).message).toBe('boom');
  });

  it('propagates captured.traceId onto the diagnostic envelope', () => {
    const emitter = new EventEmitter2();
    cleanups.push(attachNotificationsDiagnostics(emitter));
    const sent = capture('sent');
    cleanups.push(sent.off);

    emitter.emit(
      NotificationEvents.sent,
      new NotificationSentEvent(notifiable, notification, 'mail', 'tenant-1', 1, undefined, {
        traceId: 't-1',
      }),
    );

    expect(sent.seen[0]?.traceId).toBe('t-1');
  });

  it('stops emitting after the returned unsubscribe is called', () => {
    const emitter = new EventEmitter2();
    const off = attachNotificationsDiagnostics(emitter);
    const sent = capture('sent');
    cleanups.push(sent.off);
    off();

    emitter.emit(
      NotificationEvents.sent,
      new NotificationSentEvent(notifiable, notification, 'mail'),
    );

    expect(sent.seen.length).toBe(0);
  });

  it('does not throw when no channel is subscribed', () => {
    const emitter = new EventEmitter2();
    cleanups.push(attachNotificationsDiagnostics(emitter));

    expect(() =>
      emitter.emit(
        NotificationEvents.sent,
        new NotificationSentEvent(notifiable, notification, 'mail'),
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/diagnostics/src/attach-notifications-diagnostics.spec.ts`
Expected: FAIL — `attach-notifications-diagnostics` / `attachNotificationsDiagnostics` not found.

- [ ] **Step 5: Write the implementation**

`packages/diagnostics/src/attach-notifications-diagnostics.ts`:

```ts
import {
  NotificationEvents,
  type NotificationFailedEvent,
  type NotificationSendingEvent,
  type NotificationSentEvent,
} from '@dudousxd/nestjs-notifications-core';
import { emit } from '@dudousxd/nestjs-diagnostics';
import type { EventEmitter2 } from '@nestjs/event-emitter';

type NotificationEvent =
  | NotificationSendingEvent
  | NotificationSentEvent
  | NotificationFailedEvent;

// (core event name) → (diagnostics channel event segment). The `notification.` prefix is dropped so
// the channel reads `aviary:notifications:sent`, not `aviary:notifications:notification.sent`.
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

`packages/diagnostics/src/index.ts`:

```ts
export { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/diagnostics/src/attach-notifications-diagnostics.spec.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @dudousxd/nestjs-notifications-diagnostics typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/diagnostics pnpm-lock.yaml
git commit -F - <<'EOF'
feat(diagnostics): attachNotificationsDiagnostics bridge to the Aviary bus

New @dudousxd/nestjs-notifications-diagnostics package. attachNotificationsDiagnostics(emitter)
re-emits the core notification.sending/sent/failed events over @dudousxd/nestjs-diagnostics on
aviary:notifications:{sending,sent,failed}. Payload is the event instance; captured.traceId is
propagated onto the envelope. Zero-cost when no channel is subscribed; never throws back into
@nestjs/event-emitter. Mirrors the durable-diagnostics package.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Typed `ChannelRegistry` augmentation

**Files:**
- Create: `packages/diagnostics/src/channel-registry.ts`
- Create: `packages/diagnostics/src/channel-registry.type-test.ts`
- Modify: `packages/diagnostics/src/index.ts` (add side-effect import)

**Interfaces:**
- Consumes: `type NotificationSendingEvent/SentEvent/FailedEvent` from `@dudousxd/nestjs-notifications-core`; augments `ChannelRegistry` in `@dudousxd/nestjs-diagnostics`.
- Produces: typed `('notifications', <event>)` channels.

- [ ] **Step 1: Write the augmentation**

`packages/diagnostics/src/channel-registry.ts`:

```ts
import type {
  NotificationFailedEvent,
  NotificationSendingEvent,
  NotificationSentEvent,
} from '@dudousxd/nestjs-notifications-core';

// Declaration-merge notifications' three lifecycle channels into the diagnostics ChannelRegistry so
// `@OnDiagnostic('notifications', 'failed')`, `getChannel('notifications', 'failed')`, and
// `emit('notifications', 'failed', …)` all infer the matching event-class payload. Purely additive.
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

- [ ] **Step 2: Write the tsc-checked guard**

`packages/diagnostics/src/channel-registry.type-test.ts`:

```ts
/**
 * Compile-time guard for the ChannelRegistry augmentation in ./channel-registry. The augmentation
 * has no runtime effect, so it cannot be guarded by a runtime (vitest) test — only by the type
 * checker. This file is type-checked by `pnpm typecheck` (tsc includes src/**, excludes *.spec.ts)
 * and is never shipped (tsup bundles only index.ts, which does not import this file). If the
 * augmentation stops mapping ('notifications', <event>) to its event class, these lines fail to
 * compile.
 */
import type { NotificationSentEvent } from '@dudousxd/nestjs-notifications-core';
import { emit } from '@dudousxd/nestjs-diagnostics';
import './channel-registry';

declare const sentEvent: NotificationSentEvent;

// Positive: the augmentation makes NotificationSentEvent the accepted payload for the sent channel.
export function _acceptsSentEvent(): void {
  emit('notifications', 'sent', sentEvent);
}

// Negative: a non-event payload is rejected ONLY because the augmentation narrowed it. Without the
// augmentation, emit('notifications', ...) accepts `unknown`, the number below would be accepted, and
// this directive would become an unused-directive compile error — proving the augmentation is live.
export function _rejectsWrongPayload(): void {
  // @ts-expect-error - payload must be a NotificationSentEvent, not a number
  emit('notifications', 'sent', 123);
}
```

- [ ] **Step 3: Wire the side-effect import into the barrel**

Modify `packages/diagnostics/src/index.ts` to:

```ts
export { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';
import './channel-registry'; // side-effect: registers the typed notifications channels
```

- [ ] **Step 4: Typecheck (this is the guard's enforcement point)**

Run: `pnpm --filter @dudousxd/nestjs-notifications-diagnostics typecheck`
Expected: PASS. (The `@ts-expect-error` in the type-test is consumed because the augmentation narrows the payload; `tsc` includes the non-spec `.type-test.ts` file.)

- [ ] **Step 5: Prove the guard is real (not a tautology)**

Temporarily comment out the `notifications: { ... }` body inside `channel-registry.ts`, re-run `pnpm --filter @dudousxd/nestjs-notifications-diagnostics typecheck`, and confirm it now FAILS with `TS2578: Unused '@ts-expect-error' directive` on the `123` line. Then RESTORE `channel-registry.ts` exactly and re-run to confirm PASS. (Report both outcomes.)

- [ ] **Step 6: Confirm the existing spec still passes**

Run: `pnpm exec vitest run packages/diagnostics/src/attach-notifications-diagnostics.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/diagnostics/src
git commit -F - <<'EOF'
feat(diagnostics): typed ChannelRegistry augmentation for notifications channels

Declaration-merge notifications' three lifecycle channels into the diagnostics
ChannelRegistry so @OnDiagnostic('notifications', ...) and getChannel infer the
matching event-class payload. Guarded by a tsc-checked type-test (positive emit +
@ts-expect-error negative that fails to compile if the augmentation is removed).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: `NotificationsDiagnosticsModule`

**Files:**
- Create: `packages/diagnostics/src/notifications-diagnostics.module.ts`
- Modify: `packages/diagnostics/src/index.ts` (export the module)
- Test: `packages/diagnostics/src/notifications-diagnostics.module.spec.ts`

**Interfaces:**
- Consumes: `EventEmitter2` from `@nestjs/event-emitter`; `ModuleRef` from `@nestjs/core`; Nest lifecycle hooks from `@nestjs/common`; `attachNotificationsDiagnostics` from Task 1.
- Produces: `NotificationsDiagnosticsModule.forRoot(): DynamicModule` — global; attaches on init, detaches on destroy.

- [ ] **Step 1: Write the failing test**

`packages/diagnostics/src/notifications-diagnostics.module.spec.ts`:

```ts
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Isolate the module's responsibility (resolve EventEmitter2 + attach on init, detach on destroy)
// from the bridge's behavior (covered by attach-notifications-diagnostics.spec.ts). Mocking the
// bridge lets us assert the module calls attach with the container's emitter and calls the returned
// unsubscribe on destroy — without re-testing the emit path.
const { attachSpy, offSpy } = vi.hoisted(() => {
  const offSpy = vi.fn();
  return { offSpy, attachSpy: vi.fn(() => offSpy) };
});
vi.mock('./attach-notifications-diagnostics', () => ({ attachNotificationsDiagnostics: attachSpy }));

import { NotificationsDiagnosticsModule } from './notifications-diagnostics.module';

describe('NotificationsDiagnosticsModule', () => {
  afterEach(() => {
    attachSpy.mockClear();
    offSpy.mockClear();
  });

  it('resolves EventEmitter2 and attaches on init', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), NotificationsDiagnosticsModule.forRoot()],
    }).compile();
    await moduleRef.init();
    try {
      expect(attachSpy).toHaveBeenCalledTimes(1);
      expect(attachSpy).toHaveBeenCalledWith(moduleRef.get(EventEmitter2, { strict: false }));
    } finally {
      await moduleRef.close();
    }
  });

  it('calls the unsubscribe returned by attach on destroy', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), NotificationsDiagnosticsModule.forRoot()],
    }).compile();
    await moduleRef.init();
    expect(offSpy).not.toHaveBeenCalled();
    await moduleRef.close();
    expect(offSpy).toHaveBeenCalledTimes(1);
  });

  it('warns and does not throw when EventEmitterModule is absent', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsDiagnosticsModule.forRoot()],
    }).compile();
    await expect(moduleRef.init()).resolves.toBeDefined();
    expect(attachSpy).not.toHaveBeenCalled();
    await moduleRef.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/diagnostics/src/notifications-diagnostics.module.spec.ts`
Expected: FAIL — `notifications-diagnostics.module` / `NotificationsDiagnosticsModule` not found.

- [ ] **Step 3: Write the module**

`packages/diagnostics/src/notifications-diagnostics.module.ts`:

```ts
import {
  type DynamicModule,
  Global,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';

/** Resolves the already-provided EventEmitter2 on init and attaches the diagnostics bridge; detaches
 *  on destroy. Warns and no-ops if EventEmitter2 is absent (full back-compat). */
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

/**
 * Import once at the app root (alongside `EventEmitterModule.forRoot()` and `NotificationsModule`) to
 * put notifications on the Aviary diagnostics bus — every send/sent/failed is then observable via
 * `@OnDiagnostic('notifications', ...)` or any `getChannel('notifications', ...)` subscriber.
 *
 * ```ts
 * @Module({ imports: [
 *   EventEmitterModule.forRoot(),
 *   NotificationsModule.forRoot({ ... }),
 *   NotificationsDiagnosticsModule.forRoot(),
 * ] })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({})
export class NotificationsDiagnosticsModule {
  static forRoot(): DynamicModule {
    return {
      module: NotificationsDiagnosticsModule,
      providers: [NotificationsDiagnosticsAttacher],
    };
  }
}
```

- [ ] **Step 4: Export the module from the barrel**

Modify `packages/diagnostics/src/index.ts` to:

```ts
export { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';
export { NotificationsDiagnosticsModule } from './notifications-diagnostics.module';
import './channel-registry'; // side-effect: registers the typed notifications channels
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/diagnostics/src/notifications-diagnostics.module.spec.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @dudousxd/nestjs-notifications-diagnostics typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/diagnostics/src
git commit -F - <<'EOF'
feat(diagnostics): NotificationsDiagnosticsModule for import-and-forget wiring

Global Nest module that resolves EventEmitter2 from ModuleRef on init and attaches
the diagnostics bridge, detaching on destroy. Warns and no-ops if EventEmitterModule
is absent. Import alongside NotificationsModule to put notifications on the Aviary bus.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: README + changeset

**Files:**
- Create: `packages/diagnostics/README.md`
- Create: `.changeset/notifications-diagnostics.md`

- [ ] **Step 1: Write the README**

`packages/diagnostics/README.md`:

````markdown
# @dudousxd/nestjs-notifications-diagnostics

Put [`nestjs-notifications`](https://github.com/DavideCarvalho/nestjs-notifications) on the Aviary
diagnostics bus. Every per-channel delivery event is re-emitted over
[`@dudousxd/nestjs-diagnostics`](https://github.com/DavideCarvalho/nestjs-diagnostics) on the
**`aviary:notifications:<event>`** channels — so `@OnDiagnostic('notifications', 'failed')`, the
Telescope diagnostics watcher, or any `getChannel('notifications', …)` subscriber reacts to
notification activity with no extra dependencies. Additive: your existing Telescope and
delivery-tracking integrations are untouched.

## Install

```bash
pnpm add @dudousxd/nestjs-notifications-diagnostics @dudousxd/nestjs-diagnostics
```

## Use (Nest)

Requires `EventEmitterModule.forRoot()` (the core notification events flow through
`@nestjs/event-emitter`).

```ts
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsModule } from '@dudousxd/nestjs-notifications-core';
import { NotificationsDiagnosticsModule } from '@dudousxd/nestjs-notifications-diagnostics';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    NotificationsModule.forRoot({ /* ... */ }),
    NotificationsDiagnosticsModule.forRoot(),
  ],
})
export class AppModule {}
```

React anywhere by subscribing to the channel — needs nothing beyond diagnostics:

```ts
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { getChannel, type DiagnosticEvent } from '@dudousxd/nestjs-diagnostics';
import type { NotificationFailedEvent } from '@dudousxd/nestjs-notifications-core';

@Injectable()
export class NotificationAlerts implements OnModuleInit {
  onModuleInit() {
    getChannel('notifications', 'failed').subscribe((msg) => {
      const event = (msg as DiagnosticEvent).payload as NotificationFailedEvent;
      // alert on delivery failures, increment a metric, ...
    });
  }
}
```

With a diagnostics version that ships the `/nestjs` subpath (the `@OnDiagnostic` decorator), the same
reaction is one annotation — the typed `ChannelRegistry` augmentation this package contributes infers
the event payload for you:

```ts
import { Injectable } from '@nestjs/common';
import { OnDiagnostic } from '@dudousxd/nestjs-diagnostics/nestjs';
import type { NotificationFailedEvent } from '@dudousxd/nestjs-notifications-core';

@Injectable()
export class NotificationAlerts {
  @OnDiagnostic('notifications', 'failed')
  onFailed(event: { payload: NotificationFailedEvent }) {
    // ...
  }
}
```

## Use (manual / non-Nest)

```ts
import { attachNotificationsDiagnostics } from '@dudousxd/nestjs-notifications-diagnostics';

const detach = attachNotificationsDiagnostics(eventEmitter); // eventEmitter: EventEmitter2
// ... later
detach();
```

## Channels

The whole event instance is the payload; the triggering request's `captured.traceId` (when
`nestjs-context` is present) is propagated onto the diagnostic envelope.

| Channel | When | Payload |
| --- | --- | --- |
| `aviary:notifications:sending` | before a channel attempts delivery | `NotificationSendingEvent` |
| `aviary:notifications:sent` | a channel delivered successfully | `NotificationSentEvent` (`durationMs`, `response`) |
| `aviary:notifications:failed` | a channel threw | `NotificationFailedEvent` (`error`, `durationMs`) |

Emission is **zero-cost when no one is subscribed** — diagnostics short-circuits before allocating —
and never throws back into `@nestjs/event-emitter`.
````

- [ ] **Step 2: Write the changeset**

`.changeset/notifications-diagnostics.md`:

```markdown
---
"@dudousxd/nestjs-notifications-diagnostics": minor
---

Add `@dudousxd/nestjs-notifications-diagnostics`: bridge the core notification lifecycle events onto the Aviary diagnostics bus (`aviary:notifications:{sending,sent,failed}`). Ships `attachNotificationsDiagnostics(emitter)`, a global `NotificationsDiagnosticsModule`, and a typed `ChannelRegistry` augmentation so `@OnDiagnostic('notifications', ...)` infers the event-class payload. Propagates `captured.traceId` onto the diagnostic envelope.
```

- [ ] **Step 3: Verify the package builds**

Run: `pnpm --filter @dudousxd/nestjs-notifications-diagnostics build`
Expected: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts` produced; no errors.

- [ ] **Step 4: Run the full package test suite once more**

Run: `pnpm exec vitest run packages/diagnostics`
Expected: all specs pass (5 attach + 3 module = 8 tests; the channel-registry guard is a tsc type-test, not a vitest spec).

- [ ] **Step 5: Commit**

```bash
git add packages/diagnostics/README.md .changeset/notifications-diagnostics.md
git commit -F - <<'EOF'
docs(diagnostics): README and changeset for nestjs-notifications-diagnostics

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Self-Review

**Spec coverage:**
- `attachNotificationsDiagnostics` primitive (3 events, payload = event, traceId propagation) → Task 1. ✅
- Short channel names `sending/sent/failed` → Task 1 `EVENT_MAP`. ✅
- Typed `ChannelRegistry` augmentation + tsc-enforced guard → Task 2. ✅
- `NotificationsDiagnosticsModule` (init attach / destroy detach via ModuleRef, warn-no-op when EventEmitter2 absent) → Task 3. ✅
- Package mirrors telescope build (tsup dual ESM+CJS, tsconfig Bundler, exports map, external list) → Task 1 scaffold. ✅
- README + changeset → Task 4. ✅

**Type consistency:** `attachNotificationsDiagnostics(emitter: EventEmitter2): () => void` referenced identically in Tasks 1, 3. The augmentation's event-class payloads (Task 2) match the `emit('notifications', channelEvent, event)` call in Task 1. Channel segments `sending/sent/failed` consistent across Tasks 1, 2, 4.

**Notes for the implementer (flagged, not placeholders):**
- Task 1 test constructs events with `{} as Notifiable` / `{} as Notification` — valid because the bridge never introspects those fields (only `event.captured?.traceId` and pass-through). If `NotificationSentEvent`'s constructor arity differs from the spec's, check `packages/core/src/events.ts` and adjust the test's constructor calls (the assertions are unchanged).
- Task 3 uses `OnModuleInit`/`OnModuleDestroy` (not application-level hooks) so `moduleRef.init()`/`moduleRef.close()` fire them — matching the `delivery-tracking` listener.
