import type { MessageEvent } from '@nestjs/common';
import { type Observable, firstValueFrom, take } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SseHub } from './sse.hub';
import { createNotificationsStreamController } from './stream-controller';

type StreamController = { stream(req: unknown): Observable<MessageEvent> };

function instantiate(
  ctrl: ReturnType<typeof createNotificationsStreamController>,
  hub: SseHub,
): StreamController {
  return new (ctrl as unknown as new (hub: SseHub) => StreamController)(hub);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createNotificationsStreamController', () => {
  it('streams events published to the resolved route key', async () => {
    const hub = new SseHub();
    const Ctrl = createNotificationsStreamController({
      resolveRoute: (req: { userId: string }) => req.userId,
      heartbeatMs: 0,
    });
    const controller = instantiate(Ctrl, hub);

    const received = firstValueFrom(controller.stream({ userId: 'u1' }).pipe(take(1)));
    await tick(); // let the async key resolve + switchMap subscribe to the hub stream
    hub.publish('u1', { invoice: 1 }, { event: 'notification' });

    expect(await received).toEqual({ data: { invoice: 1 }, type: 'notification' });
  });

  it('uses a tenant-prefixed key when resolveTenant is provided', async () => {
    const hub = new SseHub();
    const Ctrl = createNotificationsStreamController({
      resolveRoute: () => 'u1',
      resolveTenant: () => 'acme',
      heartbeatMs: 0,
    });
    const controller = instantiate(Ctrl, hub);

    const received = firstValueFrom(controller.stream({}).pipe(take(1)));
    await tick();
    // Published under the tenant-scoped key only.
    hub.publish('acme:u1', { ok: true }, { event: 'notification' });

    expect((await received).data).toEqual({ ok: true });
  });
});
