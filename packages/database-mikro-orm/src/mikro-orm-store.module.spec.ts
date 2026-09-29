import 'reflect-metadata';
import { NotificationsModule } from '@dudousxd/nestjs-notifications-core';
import {
  DatabaseChannel,
  DatabaseChannelModule,
  NOTIFICATION_STORE,
  NotificationsQueryService,
} from '@dudousxd/nestjs-notifications-database';
import {
  DigestCollector,
  PENDING_DIGEST_STORE,
  PreferencesModule,
} from '@dudousxd/nestjs-notifications-preferences';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { MikroOrmNotificationStoreModule } from './mikro-orm-notification-store.module';
import { MikroOrmNotificationStore } from './mikro-orm-notification.store';
import { MikroOrmPendingDigestStoreModule } from './mikro-orm-pending-digest-store.module';
import { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
import { NotificationEntity } from './notification.entity';
import { NotificationRepository } from './notification.repository';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
import { DigestWindowRepository, PendingDigestRepository } from './pending-digest.repository';

class InvoicePaid {
  constructor(readonly amount: number) {}
  via() {
    return ['database'];
  }
  toDatabase() {
    return { amount: this.amount };
  }
}

const sqlite = () =>
  MikroOrmModule.forRoot({
    driver: SqliteDriver,
    dbName: ':memory:',
    entities: [NotificationEntity, PendingDigestEntity, DigestWindowEntity],
    allowGlobalContext: true,
  });

describe('MikroORM store modules (Nest wiring, sqlite)', () => {
  it('pairs with a SIBLING DatabaseChannelModule.forFeature() (the documented wiring)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        sqlite(),
        MikroOrmNotificationStoreModule.forFeature(),
        DatabaseChannelModule.forFeature({ controller: false }),
      ],
    }).compile();
    await moduleRef.init(); // SchemaInitializer → ensureSchema()

    expect(moduleRef.get(NOTIFICATION_STORE)).toBeInstanceOf(MikroOrmNotificationStore);
    await moduleRef
      .get(DatabaseChannel)
      .send({ id: 7, constructor: { name: 'User' } } as never, new InvoicePaid(42) as never);
    const query = moduleRef.get(NotificationsQueryService);
    expect(await query.unreadCount({ type: 'User', id: '7' })).toBe(1);
    await moduleRef.close();
  });

  it('pairs with a SIBLING PreferencesModule.forDigest({ store }) (the documented wiring)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        sqlite(),
        EventEmitterModule.forRoot(),
        NotificationsModule.forRoot({ global: true }),
        MikroOrmPendingDigestStoreModule.forFeature(),
        PreferencesModule.forDigest({ store: MikroOrmPendingDigestStore }),
      ],
    }).compile();
    await moduleRef.init();

    const store = moduleRef.get<MikroOrmPendingDigestStore>(PENDING_DIGEST_STORE);
    expect(store).toBeInstanceOf(MikroOrmPendingDigestStore);
    expect(moduleRef.get(DigestCollector)).toBeInstanceOf(DigestCollector);
    await store.ensureSchema();
    expect(await store.tryLockWindow('daily', '2026-01-01')).toBe(true);
    expect(await store.tryLockWindow('daily', '2026-01-01')).toBe(false);
    await moduleRef.close();
  });

  it('makes the custom repositories injectable app-wide (re-exported forFeature module)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        sqlite(),
        MikroOrmNotificationStoreModule.forFeature(),
        MikroOrmPendingDigestStoreModule.forFeature(),
      ],
    }).compile();

    expect(moduleRef.get(NotificationRepository)).toBeInstanceOf(NotificationRepository);
    expect(moduleRef.get(PendingDigestRepository)).toBeInstanceOf(PendingDigestRepository);
    expect(moduleRef.get(DigestWindowRepository)).toBeInstanceOf(DigestWindowRepository);
    await moduleRef.close();
  });
});
