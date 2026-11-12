import { AsyncLocalStorage } from 'node:async_hooks';
import {
  CONTEXT_ACCESSOR,
  type Notifiable,
  type NotifiableRef,
} from '@dudousxd/nestjs-notifications-core';
import { Global, type INestApplication, Module, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseChannel } from './database.channel';
import { DatabaseChannelModule } from './database.module';
import { InMemoryStore } from './in-memory.store';
import { resetInboxRegistry } from './inbox-registry';
import type { NotificationStore, StoredNotification } from './interfaces';
import { NotificationsQueryService } from './notifications-query.service';
import type { TenancyOption } from './tenancy';
import { NOTIFICATION_STORE } from './tokens';

/**
 * A stand-in for `@dudousxd/nestjs-context`'s accessor with the same tenancy semantics: no store is
 * `system`, `allTenants` is `all`, a tenant whose kind is outside `kinds` is `tenantless`.
 */
type Ref = { id: string; kind: string; source: string };
type Store = { tenant?: Ref; all?: boolean };
const als = new AsyncLocalStorage<Store>();
const ctx = { enabled: true, kinds: undefined as string[] | undefined };
const accessor = {
  traceId: () => undefined,
  tenantId: () => als.getStore()?.tenant?.id,
  userRef: () => undefined,
  get: () => als.getStore(),
  tenant: () => als.getStore()?.tenant,
  tenancy: () => ({ enabled: ctx.enabled, ...(ctx.kinds ? { kinds: ctx.kinds } : {}) }),
  tenantFilter(options?: { kinds?: string[] }) {
    const store = als.getStore();
    if (!store) return { mode: 'system' as const };
    if (store.all) return { mode: 'all' as const };
    const kinds = options?.kinds ?? ctx.kinds;
    if (store.tenant && (!kinds || kinds.includes(store.tenant.kind))) {
      return { mode: 'tenant' as const, tenant: store.tenant };
    }
    return { mode: 'tenantless' as const };
  },
};
const asTenant = <T>(id: string, fn: () => T, kind = 'organization') =>
  als.run({ tenant: { id, kind, source: 'app' } }, fn);
const tenantless = <T>(fn: () => T) => als.run({}, fn);
const allTenants = <T>(fn: () => T) => als.run({ all: true }, fn);

const ref: NotifiableRef = { type: 'User', id: '42' };

async function seed(store: InMemoryStore) {
  const row = (tenantId: string | null, type: string) =>
    store.save({ type, notifiableType: 'User', notifiableId: '42', data: {}, tenantId });
  return { a: await row('org_1', 'A'), b: await row('org_2', 'B'), n: await row(null, 'N') };
}

const types = (rows: StoredNotification[]) => rows.map((r) => r.type).sort();

function service(store: NotificationStore, tenancy?: TenancyOption, acc: unknown = accessor) {
  return new NotificationsQueryService(store, undefined, acc, tenancy);
}

beforeEach(() => {
  ctx.enabled = true;
  ctx.kinds = undefined;
  NotificationsQueryService.resetOwnershipWarning();
});

describe('inbox tenancy: off is identical', () => {
  it.each([
    [
      'context tenancy disabled',
      'inherit' as const,
      accessor,
      () => {
        ctx.enabled = false;
      },
    ],
    ['the lib option is false', false as const, accessor, () => {}],
    ['no context at all', 'inherit' as const, null, () => {}],
    [
      'an older context accessor without tenancy',
      'inherit' as const,
      {
        traceId: () => undefined,
        tenantId: () => 'org_1',
        userRef: () => undefined,
        get: () => ({}),
      },
      () => {},
    ],
  ])('%s: a tenant request sees every row', async (_name, option, acc, arrange) => {
    arrange();
    const store = new InMemoryStore();
    await seed(store);
    const svc = service(store, option, acc);
    await asTenant('org_1', async () => {
      expect(types(await svc.all(ref))).toEqual(['A', 'B', 'N']);
      expect(await svc.unreadCount(ref)).toBe(3);
      expect((await svc.paginate(ref)).meta.total).toBe(3);
    });
  });
});

describe('inbox tenancy: the matching matrix', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it.each([
    ['tenant', 'tenantless', (fn: () => Promise<void>) => asTenant('org_1', fn), ['A']],
    ['tenant', 'shared', (fn: () => Promise<void>) => asTenant('org_1', fn), ['A', 'N']],
    ['tenantless', 'tenantless', tenantless, ['N']],
    ['tenantless', 'shared', tenantless, ['N']],
    ['all', 'tenantless', allTenants, ['A', 'B', 'N']],
    ['system', 'tenantless', (fn: () => Promise<void>) => fn(), ['A', 'B', 'N']],
  ] as const)('%s mode, nullRows %s', async (_mode, nullRows, run, expected) => {
    await seed(store);
    const svc = service(store, { nullRows });
    await run(async () => {
      expect(types(await svc.all(ref))).toEqual(expected);
      expect(types(await svc.unread(ref))).toEqual(expected);
      expect(await svc.unreadCount(ref)).toBe(expected.length);
      const page = await svc.paginate(ref, { perPage: 10 });
      expect(types(page.items)).toEqual(expected);
      expect(page.meta.total).toBe(expected.length);
    });
  });

  it('a row of another tenant is not found (404), never forbidden', async () => {
    const { a, b, n } = await seed(store);
    const svc = service(store);
    await asTenant('org_1', async () => {
      await expect(svc.markAsRead(b.id, ref)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.delete(b.id, ref)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.delete(n.id, ref)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.delete(b.id)).rejects.toBeInstanceOf(NotFoundException);
      await svc.markAsRead(a.id, ref);
    });
    await tenantless(async () => {
      await expect(svc.delete(a.id, ref)).rejects.toBeInstanceOf(NotFoundException);
      await svc.delete(n.id, ref);
    });
    expect((await store.findById(a.id))?.readAt).not.toBeNull();
    expect(await store.findById(b.id)).not.toBeNull();
    expect(await store.findById(n.id)).toBeNull();
  });

  it('nullRows shared lets a tenant act on rows with no tenant', async () => {
    const { n } = await seed(store);
    const svc = service(store, { nullRows: 'shared' });
    await asTenant('org_1', () => svc.markAsRead(n.id, ref));
    expect((await store.findById(n.id))?.readAt).not.toBeNull();
  });

  it('the matching rule holds for stores without findById', async () => {
    const { b, n } = await seed(store);
    const bare = Object.assign(Object.create(InMemoryStore.prototype), store, {
      findById: undefined,
    }) as InMemoryStore;
    const svc = service(bare);
    await tenantless(async () => {
      await expect(svc.delete(b.id, ref)).rejects.toBeInstanceOf(NotFoundException);
      await svc.markAsRead(n.id, ref);
    });
  });

  it('markAllAsRead only touches the rows the request can see', async () => {
    const { a, b, n } = await seed(store);
    const svc = service(store);
    await tenantless(() => svc.markAllAsRead(ref));
    expect((await store.findById(n.id))?.readAt).not.toBeNull();
    expect((await store.findById(a.id))?.readAt).toBeNull();
    await asTenant('org_1', () => svc.markAllAsRead(ref));
    expect((await store.findById(a.id))?.readAt).not.toBeNull();
    expect((await store.findById(b.id))?.readAt).toBeNull();
  });

  it('kinds: a tenant of another kind is tenantless', async () => {
    await seed(store);
    const svc = service(store, { kinds: ['organization'] });
    await asTenant('u_1', async () => expect(types(await svc.all(ref))).toEqual(['N']), 'user');
    ctx.kinds = ['clinic'];
    const inherited = service(store);
    await asTenant('org_1', async () => expect(types(await inherited.all(ref))).toEqual(['N']));
  });

  it('an explicit forTenant() wins over the context tenant', async () => {
    const { b } = await seed(store);
    const svc = service(store);
    await asTenant('org_1', async () => {
      expect(types(await svc.forTenant('org_2').all(ref))).toEqual(['B']);
      await svc.forTenant('org_2').markAsRead(b.id, ref);
    });
    expect((await store.findById(b.id))?.readAt).not.toBeNull();
  });

  it('reads the context from the global slot when nothing is injected', async () => {
    await seed(store);
    const slot = Symbol.for('@dudousxd/nestjs-diagnostics:accessor');
    const g = globalThis as unknown as Record<symbol, unknown>;
    const previous = g[slot];
    g[slot] = { current: accessor };
    try {
      const svc = new NotificationsQueryService(store);
      await asTenant('org_2', async () => expect(types(await svc.all(ref))).toEqual(['B']));
    } finally {
      g[slot] = previous;
    }
  });
});

describe('database channel: stamping the tenant', () => {
  const user: Notifiable = { toNotifiableRef: () => ref };
  class Hello {
    toArray() {
      return {};
    }
  }
  const send = async (channel: DatabaseChannel, context?: Parameters<DatabaseChannel['send']>[2]) =>
    ((await channel.send(user, new Hello(), context)) as StoredNotification).tenantId;

  it('stamps the context tenant on a send with no explicit tenant', async () => {
    const channel = new DatabaseChannel(new InMemoryStore(), accessor);
    expect(await asTenant('org_1', () => send(channel))).toBe('org_1');
    expect(await tenantless(() => send(channel))).toBeNull();
    expect(await allTenants(() => send(channel))).toBeNull();
  });

  it('an explicit tenant wins', async () => {
    const channel = new DatabaseChannel(new InMemoryStore(), accessor);
    expect(await asTenant('org_1', () => send(channel, { tenant: 'org_9' }))).toBe('org_9');
  });

  it('a worker with no live context uses the tenant captured at send() time', async () => {
    const channel = new DatabaseChannel(new InMemoryStore(), accessor, { kinds: ['organization'] });
    const captured = (tenantKind: string) => ({ captured: { tenantId: 'org_3', tenantKind } });
    expect(await send(channel, captured('organization'))).toBe('org_3');
    expect(await send(channel, captured('user'))).toBeNull();
  });

  it('tenancy off keeps today’s stamping', async () => {
    ctx.enabled = false;
    const channel = new DatabaseChannel(new InMemoryStore(), accessor);
    expect(await asTenant('org_1', () => send(channel))).toBeNull();
    expect(await send(channel, { captured: { tenantId: 'org_3' } })).toBe('org_3');
  });
});

describe('inbox controller under tenancy (HTTP)', () => {
  const apps: INestApplication[] = [];
  beforeEach(() => resetInboxRegistry());
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  @Global()
  @Module({
    providers: [{ provide: CONTEXT_ACCESSOR, useValue: accessor }],
    exports: [CONTEXT_ACCESSOR],
  })
  class FakeContextModule {}

  async function boot(tenancy?: TenancyOption) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FakeContextModule,
        DatabaseChannelModule.forRoot({
          autoCreateSchema: false,
          ...(tenancy !== undefined ? { tenancy } : {}),
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    // Stands in for the app's auth guard calling Context.setTenant(): `x-org` is the verified org.
    app.use((req: any, _res: unknown, next: () => void) => {
      req.user = { id: '42' };
      const org = req.headers['x-org'];
      als.run(org ? { tenant: { id: org, kind: 'organization', source: 'app' } } : {}, next);
    });
    await app.listen(0);
    apps.push(app);
    const rows = await seed(app.get<InMemoryStore>(NOTIFICATION_STORE));
    const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    const call = (path: string, org?: string, method = 'GET') =>
      fetch(`${url}${path}`, { method, headers: org ? { 'x-org': org } : {} });
    return { rows, call };
  }

  it('lists only the request tenant and answers 404 for another tenant’s row', async () => {
    const { rows, call } = await boot();
    const list = await (await call('/notifications', 'org_1')).json();
    expect(list.items.map((r: StoredNotification) => r.type)).toEqual(['A']);
    expect((await call(`/notifications/${rows.b.id}`, 'org_1', 'DELETE')).status).toBe(404);
    expect((await call(`/notifications/${rows.b.id}/read`, 'org_1', 'POST')).status).toBe(404);
    expect((await call(`/notifications/${rows.a.id}`, 'org_1', 'DELETE')).status).toBe(200);
    const orgless = await (await call('/notifications/unread')).json();
    expect(orgless.map((r: StoredNotification) => r.type)).toEqual(['N']);
  });

  it('tenancy: false keeps the inbox unscoped', async () => {
    const { call } = await boot(false);
    expect(await (await call('/notifications/unread/count', 'org_1')).json()).toEqual({ count: 3 });
  });
});
