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
