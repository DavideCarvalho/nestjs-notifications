import {
  NotificationService,
  NotificationsModule,
  RouteFor,
} from '@dudousxd/nestjs-notifications-core';
import { Mail, MailChannelModule, MailMessage } from '@dudousxd/nestjs-notifications-mail';
import { InMemoryMailTransport, MailModule, MailTransport, Mailer } from '@nestjs/mail';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { DeliveryTrackingModule } from '../delivery-tracking.module';
import type { DeliveryTrackingStore } from '../interfaces';
import { mailDeliveryTracking } from '../mail';
import { DELIVERY_TRACKING_STORE } from '../tokens';

class User {
  @RouteFor('mail') email = 'ada@example.com';
}

class Welcome {
  @Mail()
  toMail() {
    return new MailMessage().subject('Welcome').line('Hi');
  }
}

class ProviderTransport extends MailTransport {
  async send() {
    return { providerMessageId: 'ses-0100' };
  }
}

async function waitForRecords(store: DeliveryTrackingStore, count: number) {
  for (let i = 0; i < 100; i++) {
    const records = await store.list();
    if (records.length >= count) return records;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return store.list();
}

describe('MailEvents → DeliveryTrackingStore', () => {
  async function app(transport: MailTransport) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NotificationsModule.forRoot({ emitter: true }),
        DeliveryTrackingModule.forRoot(),
        MailModule.forRoot({ transport, from: 'no-reply@example.com', retry: false }),
        MailChannelModule.forRoot(),
      ],
      providers: mailDeliveryTracking(),
    }).compile();
    await moduleRef.init();
    return moduleRef;
  }

  it('records a direct Mailer send with its provider message id, and a failure', async () => {
    const moduleRef = await app(new ProviderTransport());
    await moduleRef
      .get(Mailer)
      .send({ to: 'bob@example.com', subject: 'Receipt', html: '<p>ok</p>' });
    const store = moduleRef.get<DeliveryTrackingStore>(DELIVERY_TRACKING_STORE);
    const [record] = await waitForRecords(store, 1);
    expect(record).toMatchObject({
      channel: 'mail',
      status: 'sent',
      providerMessageId: 'ses-0100',
    });
    // An SES bounce for it now correlates.
    await expect(
      store.updateStatusByProviderMessageId('ses-0100', 'bounced'),
    ).resolves.toMatchObject({
      status: 'bounced',
    });
    await moduleRef.close();

    const failing = new InMemoryMailTransport();
    failing.failNext(new Error('smtp down'));
    const second = await app(failing);
    await expect(
      second.get(Mailer).send({ to: 'bob@example.com', subject: 'Receipt', html: '<p>ok</p>' }),
    ).rejects.toThrow('smtp down');
    const [failed] = await waitForRecords(second.get(DELIVERY_TRACKING_STORE), 1);
    expect(failed).toMatchObject({ status: 'failed', error: 'smtp down' });
    await second.close();
  });

  it('records a notification mail once (through the notification listener), with its provider id', async () => {
    const moduleRef = await app(new ProviderTransport());
    await moduleRef.get(NotificationService).send(new User(), new Welcome());
    const store = moduleRef.get<DeliveryTrackingStore>(DELIVERY_TRACKING_STORE);
    await waitForRecords(store, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const records = await store.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      notificationType: 'Welcome',
      providerMessageId: 'ses-0100',
    });
    await moduleRef.close();
  });
});
