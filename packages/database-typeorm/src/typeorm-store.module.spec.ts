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
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { describe, expect, it } from 'vitest';
import { NotificationEntity } from './notification.entity';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
import { TypeOrmNotificationStoreModule } from './typeorm-notification-store.module';
import { TypeOrmNotificationStore } from './typeorm-notification.store';
import { TypeOrmPendingDigestStoreModule } from './typeorm-pending-digest-store.module';
import { TypeOrmPendingDigestStore } from './typeorm-pending-digest.store';

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
  TypeOrmModule.forRoot({
    type: 'sqlite',
    database: ':memory:',
    entities: [NotificationEntity, PendingDigestEntity, DigestWindowEntity],
    synchronize: true,
  });

describe('TypeORM store modules (Nest wiring, sqlite)', () => {
  it('pairs with a SIBLING DatabaseChannelModule.forFeature() (the documented wiring)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        sqlite(),
        TypeOrmNotificationStoreModule.forFeature(),
        DatabaseChannelModule.forFeature({ controller: false }),
      ],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(NOTIFICATION_STORE)).toBeInstanceOf(TypeOrmNotificationStore);
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
        TypeOrmPendingDigestStoreModule.forFeature(),
        PreferencesModule.forDigest({ store: TypeOrmPendingDigestStore }),
      ],
    }).compile();
    await moduleRef.init();

    const store = moduleRef.get<TypeOrmPendingDigestStore>(PENDING_DIGEST_STORE);
    expect(store).toBeInstanceOf(TypeOrmPendingDigestStore);
    expect(moduleRef.get(DigestCollector)).toBeInstanceOf(DigestCollector);
    expect(await store.tryLockWindow('daily', '2026-01-01')).toBe(true);
    expect(await store.tryLockWindow('daily', '2026-01-01')).toBe(false);
    await moduleRef.close();
  });
});
