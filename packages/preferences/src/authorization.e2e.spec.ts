import { AuthorizationModule, Can, Policy } from '@nestjs/authorization';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { createPreferenceCenterController } from './preference-center.controller';
import { PreferencesModule } from './preferences.module';

type User = { id: string; admin: boolean };

/** Lets admins manage preferences, nobody else. */
@Policy()
class PreferencesPolicy {
  manage(user: User | null): boolean {
    return user?.admin === true;
  }
}

/** Boots an app with the REAL `@nestjs/authorization` global, deny-by-default guard. */
async function boot(controller: Type<unknown>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AuthorizationModule.forRoot({ policies: [PreferencesPolicy] }),
      PreferencesModule.forCenter({ categories: [{ key: 'billing', label: 'Billing' }] }),
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

async function get(app: INestApplication, path: string, headers: Record<string, string> = {}) {
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return fetch(`${url}${path}`, { headers });
}

const options = { resolveRef: (req: any) => ({ type: 'User', id: String(req.user?.id) }) };

describe('createPreferenceCenterController with @nestjs/authorization', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it('the global guard does not refuse the routes when no `decorators` are passed', async () => {
    const app = await boot(createPreferenceCenterController(options));
    apps.push(app);
    expect((await get(app, '/preferences/categories')).status).toBe(200);
    expect((await get(app, '/preferences', { 'x-user': 'u1' })).status).toBe(200);
  });

  it('enforces a `@Can()` passed through `decorators`', async () => {
    const app = await boot(
      createPreferenceCenterController({
        ...options,
        decorators: [Can(PreferencesPolicy, 'manage')],
      }),
    );
    apps.push(app);
    expect((await get(app, '/preferences')).status).toBe(401);
    expect((await get(app, '/preferences', { 'x-user': 'u1' })).status).toBe(403);
    expect((await get(app, '/preferences', { 'x-user': 'u1', 'x-admin': '1' })).status).toBe(200);
  });

  it('decorators of one controller do not leak into the next', async () => {
    const guarded = createPreferenceCenterController({
      ...options,
      decorators: [Can(PreferencesPolicy, 'manage')],
    });
    const open = createPreferenceCenterController(options);
    expect(open).not.toBe(guarded);

    const guardedApp = await boot(guarded);
    apps.push(guardedApp);
    const openApp = await boot(open);
    apps.push(openApp);
    expect((await get(guardedApp, '/preferences', { 'x-user': 'u1' })).status).toBe(403);
    expect((await get(openApp, '/preferences', { 'x-user': 'u1' })).status).toBe(200);
  });
});
