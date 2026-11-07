import { AuthorizationModule, Can, Policy } from '@nestjs/authorization';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseChannelModule } from './database.module';
import { resetInboxRegistry } from './inbox-registry';

type User = { id: string; admin: boolean };

/** Lets admins read the inbox, nobody else. */
@Policy()
class InboxPolicy {
  read(user: User | null): boolean {
    return user?.admin === true;
  }
}

/**
 * Boots an app with the REAL `@nestjs/authorization` global, deny-by-default guard. `x-user`
 * becomes `req.user` (with `x-admin: 1` making it an admin), as an authentication layer would.
 */
async function boot(database: ReturnType<typeof DatabaseChannelModule.forRoot>) {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthorizationModule.forRoot({ policies: [InboxPolicy] }), database],
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

async function get(app: INestApplication, path: string, headers: Record<string, string> = {}) {
  const url = await app.getUrl();
  return fetch(`${url.replace('[::1]', '127.0.0.1')}${path}`, { headers });
}

describe('DatabaseChannelModule with @nestjs/authorization', () => {
  const apps: INestApplication[] = [];
  beforeEach(() => resetInboxRegistry());
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it('the global guard does not refuse the inbox when no `decorators` are passed', async () => {
    const app = await boot(DatabaseChannelModule.forRoot({ autoCreateSchema: false }));
    apps.push(app);

    const res = await get(app, '/notifications/unread/count', { 'x-user': 'u1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
  });

  it('enforces a `@Can()` passed through `decorators`', async () => {
    const app = await boot(
      DatabaseChannelModule.forRoot({
        autoCreateSchema: false,
        decorators: [Can(InboxPolicy, 'read')],
      }),
    );
    apps.push(app);

    expect((await get(app, '/notifications/unread/count')).status).toBe(401);
    expect((await get(app, '/notifications/unread/count', { 'x-user': 'u1' })).status).toBe(403);
    const allowed = await get(app, '/notifications/unread/count', {
      'x-user': 'u1',
      'x-admin': '1',
    });
    expect(allowed.status).toBe(200);
  });

  it('decorators of one registration do not leak into the next', async () => {
    const guarded = DatabaseChannelModule.forRoot({
      autoCreateSchema: false,
      decorators: [Can(InboxPolicy, 'read')],
    });
    const open = DatabaseChannelModule.forRoot({ autoCreateSchema: false });
    expect(open.controllers?.[0]).not.toBe(guarded.controllers?.[0]);

    const guardedApp = await boot(guarded);
    apps.push(guardedApp);
    const openApp = await boot(open);
    apps.push(openApp);

    expect((await get(guardedApp, '/notifications/unread/count', { 'x-user': 'u1' })).status).toBe(
      403,
    );
    expect((await get(openApp, '/notifications/unread/count', { 'x-user': 'u1' })).status).toBe(
      200,
    );
  });

  it('forFeature() takes `decorators` as well', async () => {
    const feature = DatabaseChannelModule.forFeature({ decorators: [Can(InboxPolicy, 'read')] });
    const controller = feature.controllers?.[0] as object;
    expect(Reflect.getMetadata('authorization:can-anyone', controller)).toBe(true);
    expect(Reflect.getMetadata('authorization:can', controller)).toHaveLength(1);
  });
});
