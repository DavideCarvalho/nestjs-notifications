import { EntityRepository, MikroORM } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';
import type { DynamicModule, Provider } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as pkg from './index';
import { MikroOrmNotificationStoreModule } from './mikro-orm-notification-store.module';
import { MikroOrmPendingDigestStoreModule } from './mikro-orm-pending-digest-store.module';
import { NotificationEntity } from './notification.entity';
import { NotificationRepository } from './notification.repository';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
import { DigestWindowRepository, PendingDigestRepository } from './pending-digest.repository';

/**
 * Every repository the package publishes. A repository is a VALUE: an `export type` slip compiles
 * and typechecks green and is `undefined` at runtime — and it is the `provide:` of a DI provider, so
 * the failure would land at a consumer's boot rather than here.
 */
const repositories = [
  { name: 'NotificationRepository', repository: NotificationRepository },
  { name: 'PendingDigestRepository', repository: PendingDigestRepository },
  { name: 'DigestWindowRepository', repository: DigestWindowRepository },
] as const;

/** The tokens `MikroOrmModule.forFeature([...])` registers inside a store module's `imports`. */
function providedTokens(module: DynamicModule): unknown[] {
  const imported = (module.imports ?? []) as DynamicModule[];
  return imported
    .flatMap((entry) => (entry.providers ?? []) as Provider[])
    .map((provider) => (typeof provider === 'function' ? provider : provider.provide));
}

describe('repository exports', () => {
  it.each(repositories)(
    '$name is a runtime class on the package barrel',
    ({ name, repository }) => {
      const exported = (pkg as Record<string, unknown>)[name];

      expect(typeof exported).toBe('function');
      expect(exported).toBe(repository);
      expect(Object.getPrototypeOf(repository)).toBe(EntityRepository);
    },
  );

  it('exports no `Repository`-suffixed name that is missing at runtime', () => {
    const exported = Object.keys(pkg)
      .filter((name) => name.endsWith('Repository'))
      .sort();

    expect(exported).toEqual(repositories.map(({ name }) => name).sort());
  });
});

describe('MikroOrmModule.forFeature registration', () => {
  it('provides NotificationRepository under itself as the token', () => {
    expect(providedTokens(MikroOrmNotificationStoreModule.forFeature())).toContain(
      NotificationRepository,
    );
  });

  it('provides both digest repositories under themselves as tokens', () => {
    const tokens = providedTokens(MikroOrmPendingDigestStoreModule.forFeature());

    expect(tokens).toContain(PendingDigestRepository);
    expect(tokens).toContain(DigestWindowRepository);
  });
});

describe('em.getRepository resolution (sqlite)', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      driver: SqliteDriver,
      dbName: ':memory:',
      entities: [NotificationEntity, PendingDigestEntity, DigestWindowEntity],
      allowGlobalContext: true,
    });
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('hands back the custom repository for every entity', () => {
    expect(orm.em.getRepository(NotificationEntity)).toBeInstanceOf(NotificationRepository);
    expect(orm.em.getRepository(PendingDigestEntity)).toBeInstanceOf(PendingDigestRepository);
    expect(orm.em.getRepository(DigestWindowEntity)).toBeInstanceOf(DigestWindowRepository);
  });
});
