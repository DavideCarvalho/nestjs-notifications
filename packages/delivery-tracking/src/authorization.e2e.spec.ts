import { AuthorizationModule, Can, Policy } from '@nestjs/authorization';
import type { INestApplication, Type } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { DeliveryTrackingModule } from './delivery-tracking.module';
import { createSesNotificationController } from './inbound/ses.controller';
import { TEST_TOPIC_ARN, createTestSigner, sesNotification } from './inbound/sns-test-fixtures';
import { computeTwilioSignature, createTwilioStatusController } from './inbound/twilio.controller';

/** Denies guests — and a provider callback carries no user. */
@Policy()
class CallbackPolicy {
  receive(user: { id: string } | null): boolean {
    return user !== null;
  }
}

const authToken = 'test-token';
const signer = createTestSigner();
const ses = (opts: { decorators?: ClassDecorator[] } = {}) =>
  createSesNotificationController({
    topicArns: [TEST_TOPIC_ARN],
    certificateLoader: async () => signer.certPem,
    ...opts,
  });

/** Boots an app with the REAL `@nestjs/authorization` global, deny-by-default guard. */
async function boot(...controllers: Type<unknown>[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      AuthorizationModule.forRoot({ policies: [CallbackPolicy] }),
      DeliveryTrackingModule.forRoot(),
    ],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0);
  return app;
}

async function postTwilio(app: INestApplication, valid = true) {
  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const path = '/webhooks/twilio/status';
  const params = { MessageSid: 'SM1', MessageStatus: 'delivered' };
  const signature = valid ? computeTwilioSignature(authToken, `${base}${path}`, params) : 'nope';
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams(params).toString(),
  });
}

/** Posts like SNS does: JSON with `Content-Type: text/plain`. */
async function postSes(app: INestApplication, valid = true) {
  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const message = sesNotification(signer, 'ses-1');
  if (!valid) message.Signature = Buffer.from('forged').toString('base64');
  return fetch(`${base}/webhooks/ses`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain; charset=UTF-8' },
    body: JSON.stringify(message),
  });
}

describe('inbound delivery-tracking controllers with @nestjs/authorization', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it('provider callbacks stay reachable under the global guard by default', async () => {
    const app = await boot(createTwilioStatusController({ authToken }), ses());
    apps.push(app);
    expect((await postTwilio(app)).status).toBe(204);
    // The Twilio signature check still decides.
    expect((await postTwilio(app, false)).status).toBe(403);
    // The SNS signature check still decides.
    expect((await postSes(app)).status).toBe(204);
    expect((await postSes(app, false)).status).toBe(403);
  });

  it('enforces a `@Can()` passed through `decorators`', async () => {
    const app = await boot(
      createTwilioStatusController({ authToken, decorators: [Can(CallbackPolicy, 'receive')] }),
      ses({ decorators: [Can(CallbackPolicy, 'receive')] }),
    );
    apps.push(app);
    expect((await postTwilio(app)).status).toBe(401);
    expect((await postSes(app)).status).toBe(401);
  });

  it('decorators of one controller do not leak into the next', async () => {
    const guarded = createTwilioStatusController({
      authToken,
      decorators: [Can(CallbackPolicy, 'receive')],
    });
    const open = createTwilioStatusController({ authToken });
    expect(open).not.toBe(guarded);

    const guardedApp = await boot(guarded);
    apps.push(guardedApp);
    const openApp = await boot(open);
    apps.push(openApp);
    expect((await postTwilio(guardedApp)).status).toBe(401);
    expect((await postTwilio(openApp)).status).toBe(204);
  });
});
