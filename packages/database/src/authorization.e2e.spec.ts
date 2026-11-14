import { AuthorizationModule, Can, Policy } from '@nestjs/authorization';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseChannelModule } from './database.module';
import type { InMemoryStore } from './in-memory.store';
import { resetInboxRegistry } from './inbox-registry';
import { NOTIFICATION_STORE } from './tokens';

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

  it('the default resolver answers 401 when no user is on the request', async () => {
    const app = await boot(DatabaseChannelModule.forRoot({ autoCreateSchema: false }));
    apps.push(app);

    expect((await get(app, '/notifications/unread/count')).status).toBe(401);
    expect((await get(app, '/notifications')).status).toBe(401);
  });

  it('`routes: false` mounts nothing', async () => {
    const app = await boot(
      DatabaseChannelModule.forRoot({ autoCreateSchema: false, routes: false }),
    );
    apps.push(app);

    expect((await get(app, '/notifications/unread/count', { 'x-user': 'u1' })).status).toBe(404);
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

  describe('list API wire', () => {
    async function seeded() {
      const app = await boot(DatabaseChannelModule.forRoot({ autoCreateSchema: false }));
      apps.push(app);
      const store = app.get<InMemoryStore>(NOTIFICATION_STORE);
      for (const type of ['A', 'B', 'C', 'A']) {
        await store.save({ type, notifiableType: 'User', notifiableId: 'u1', data: {} });
      }
      return app;
    }
    const user = { 'x-user': 'u1' };

    it('GET /notifications answers the offset envelope, paged by page/size', async () => {
      const app = await seeded();
      const res = await get(app, '/notifications?page=2&size=3', user);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.meta).toEqual({
        total: 4,
        perPage: 3,
        currentPage: 2,
        lastPage: 2,
        firstPage: 1,
      });
    });

    it('clamps size to 100 and filters by filter[type] (comma list or [])', async () => {
      const app = await seeded();
      const clamped = await (await get(app, '/notifications?size=1000', user)).json();
      expect(clamped.meta.perPage).toBe(100);

      const one = await (await get(app, '/notifications?filter[type]=A', user)).json();
      expect(one.meta.total).toBe(2);
      const comma = await (await get(app, '/notifications?filter[type]=A,B', user)).json();
      expect(comma.meta.total).toBe(3);
      const repeated = await (
        await get(app, '/notifications?filter[type][]=B&filter[type][]=C', user)
      ).json();
      expect(repeated.data.map((r: { type: string }) => r.type).sort()).toEqual(['B', 'C']);
    });

    it('accepts sort=-createdAt only', async () => {
      const app = await seeded();
      expect((await get(app, '/notifications?sort=-createdAt', user)).status).toBe(200);
      expect((await get(app, '/notifications?sort=createdAt', user)).status).toBe(400);
      expect((await get(app, '/notifications?sort=type', user)).status).toBe(400);
    });

    it('rejects bad paging and unknown filters with 400', async () => {
      const app = await seeded();
      expect((await get(app, '/notifications?page=0', user)).status).toBe(400);
      expect((await get(app, '/notifications?size=abc', user)).status).toBe(400);
      expect((await get(app, '/notifications?filter[read]=true', user)).status).toBe(400);
      expect((await get(app, '/notifications?filter[type][gt]=A', user)).status).toBe(400);
      expect((await get(app, '/notifications/unread?filter[nope]=1', user)).status).toBe(400);
      expect((await get(app, '/notifications/unread/count?filter[nope]=1', user)).status).toBe(400);
    });

    it('GET /notifications/unread answers { data }, filtered by filter[type]', async () => {
      const app = await seeded();
      const body = await (await get(app, '/notifications/unread?filter[type]=A', user)).json();
      expect(Object.keys(body)).toEqual(['data']);
      expect(body.data.map((r: { type: string }) => r.type)).toEqual(['A', 'A']);
      const count = await (
        await get(app, '/notifications/unread/count?filter[type]=B,C', user)
      ).json();
      expect(count).toEqual({ count: 2 });
    });
  });

  it('forFeature() takes `decorators` as well', async () => {
    const feature = DatabaseChannelModule.forFeature({ decorators: [Can(InboxPolicy, 'read')] });
    const controller = feature.controllers?.[0] as object;
    expect(Reflect.getMetadata('authorization:can-anyone', controller)).toBe(true);
    expect(Reflect.getMetadata('authorization:can', controller)).toHaveLength(1);
  });
});
