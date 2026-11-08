import { AuthorizationModule, Can, Policy } from '@nestjs/authorization';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SseChannelModule } from './sse.module';
import { createNotificationsStreamController } from './stream-controller';

type User = { id: string; admin: boolean };

/** Lets admins open the stream, nobody else. */
@Policy()
class StreamPolicy {
  listen(user: User | null): boolean {
    return user?.admin === true;
  }
}

/** Boots an app with the REAL `@nestjs/authorization` global, deny-by-default guard. */
async function boot(controller: Type<unknown>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AuthorizationModule.forRoot({ policies: [StreamPolicy] }),
      SseChannelModule.forRoot(),
    ],
    controllers: [controller],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.use((req: any, _res: unknown, next: () => void) => {
    const id = req.headers['x-user'];
    if (id) req.user = { id, admin: req.headers['x-admin'] === '1' };
    next();
  });
  await app.listen(0);
  return app;
}

/** Opens the stream, reads the status once headers arrive, then hangs up. */
async function streamStatus(app: INestApplication, headers: Record<string, string> = {}) {
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const abort = new AbortController();
  const res = await fetch(`${url}/notifications/stream`, { headers, signal: abort.signal });
  abort.abort();
  return res.status;
}

const options = { resolveRoute: (req: any) => String(req.user?.id), heartbeatMs: 0 };

describe('createNotificationsStreamController with @nestjs/authorization', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it('the global guard does not refuse the stream when no `decorators` are passed', async () => {
    const app = await boot(createNotificationsStreamController(options));
    apps.push(app);
    expect(await streamStatus(app, { 'x-user': 'u1' })).toBe(200);
  });

  it('enforces a `@Can()` passed through `decorators`', async () => {
    const app = await boot(
      createNotificationsStreamController({
        ...options,
        decorators: [Can(StreamPolicy, 'listen')],
      }),
    );
    apps.push(app);
    expect(await streamStatus(app)).toBe(401);
    expect(await streamStatus(app, { 'x-user': 'u1' })).toBe(403);
    expect(await streamStatus(app, { 'x-user': 'u1', 'x-admin': '1' })).toBe(200);
  });

  it('decorators of one controller do not leak into the next', async () => {
    const guarded = createNotificationsStreamController({
      ...options,
      decorators: [Can(StreamPolicy, 'listen')],
    });
    const open = createNotificationsStreamController(options);
    expect(open).not.toBe(guarded);

    const guardedApp = await boot(guarded);
    apps.push(guardedApp);
    const openApp = await boot(open);
    apps.push(openApp);
    expect(await streamStatus(guardedApp, { 'x-user': 'u1' })).toBe(403);
    expect(await streamStatus(openApp, { 'x-user': 'u1' })).toBe(200);
  });
});
