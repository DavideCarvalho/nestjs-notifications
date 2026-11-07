import type { INestApplication } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { DeliveryTrackingModule } from '../delivery-tracking.module';
import type { DeliveryTrackingStore } from '../interfaces';
import { DELIVERY_TRACKING_STORE } from '../tokens';
import { createSesNotificationController } from './ses.controller';
import { TEST_TOPIC_ARN, createTestSigner, sesNotification } from './sns-test-fixtures';

const signer = createTestSigner();

type Setup = 'default' | 'text parser' | 'rawBody';

async function boot(setup: Setup): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot(), DeliveryTrackingModule.forRoot()],
    controllers: [
      createSesNotificationController({
        topicArns: [TEST_TOPIC_ARN],
        certificateLoader: async () => signer.certPem,
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    rawBody: setup === 'rawBody',
  });
  if (setup === 'text parser') app.useBodyParser('text');
  await app.listen(0);
  return app;
}

describe('SES controller over HTTP', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it.each<[Setup, string]>([
    ['default', 'text/plain; charset=UTF-8'],
    ['text parser', 'text/plain; charset=UTF-8'],
    ['rawBody', 'text/plain; charset=UTF-8'],
    ['default', 'application/json'],
    ['rawBody', 'application/json'],
  ])('%s app, %s body: verifies and updates the delivery status', async (setup, contentType) => {
    const app = await boot(setup);
    apps.push(app);
    const store = app.get<DeliveryTrackingStore>(DELIVERY_TRACKING_STORE);
    const rec = await store.record({ channel: 'mail', notificationType: 'A', status: 'sent' });
    await store.setProviderMessageId(rec.id, 'ses-http');

    const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    const post = (body: unknown) =>
      fetch(`${base}/webhooks/ses`, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: JSON.stringify(body),
      });

    const forged = { ...sesNotification(signer, 'ses-http', 'Bounce'), Signature: 'AAAA' };
    expect((await post(forged)).status).toBe(403);
    expect((await store.get(rec.id))?.status).toBe('sent');

    expect((await post(sesNotification(signer, 'ses-http', 'Delivery'))).status).toBe(204);
    expect((await store.get(rec.id))?.status).toBe('delivered');
  });
});
