import { createHmac } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { InMemoryDeliveryTrackingStore } from './in-memory.store';
import { createSesNotificationController, mapSesNotificationType } from './inbound/ses.controller';
import {
  computeTwilioSignature,
  createTwilioStatusController,
  mapTwilioStatus,
} from './inbound/twilio.controller';

describe('InMemoryDeliveryTrackingStore', () => {
  it('records and transitions status through the lifecycle', async () => {
    const store = new InMemoryDeliveryTrackingStore();
    const rec = await store.record({
      channel: 'sms',
      notificationType: 'InvoicePaid',
      notifiableType: 'User',
      notifiableId: '42',
      status: 'sent',
    });

    expect(rec.id).toBeTruthy();
    expect(rec.status).toBe('sent');
    expect(rec.error).toBeNull();
    expect(rec.providerMessageId).toBeNull();

    await store.updateStatus(rec.id, 'delivered');
    const after = await store.get(rec.id);
    expect(after?.status).toBe('delivered');
    expect(after?.updatedAt.getTime()).toBeGreaterThanOrEqual(rec.createdAt.getTime());
  });

  it('records error on a failed transition', async () => {
    const store = new InMemoryDeliveryTrackingStore();
    const rec = await store.record({
      channel: 'sms',
      notificationType: 'InvoicePaid',
      status: 'queued',
    });
    await store.updateStatus(rec.id, 'failed', { error: 'boom' });
    expect((await store.get(rec.id))?.error).toBe('boom');
  });

  it('correlates and updates by provider message id', async () => {
    const store = new InMemoryDeliveryTrackingStore();
    const rec = await store.record({
      channel: 'sms',
      notificationType: 'InvoicePaid',
      status: 'sent',
    });
    await store.setProviderMessageId(rec.id, 'SM123');

    const updated = await store.updateStatusByProviderMessageId('SM123', 'delivered');
    expect(updated?.id).toBe(rec.id);
    expect(updated?.status).toBe('delivered');

    const miss = await store.updateStatusByProviderMessageId('UNKNOWN', 'delivered');
    expect(miss).toBeNull();
  });

  it('filters in list()', async () => {
    const store = new InMemoryDeliveryTrackingStore();
    await store.record({ channel: 'sms', notificationType: 'A', status: 'sent', tenantId: 't1' });
    await store.record({
      channel: 'mail',
      notificationType: 'B',
      status: 'failed',
      tenantId: 't2',
    });

    expect(await store.list({ channel: 'sms' })).toHaveLength(1);
    expect(await store.list({ status: 'failed' })).toHaveLength(1);
    expect(await store.list({ tenantId: 't2' })).toHaveLength(1);
    expect(await store.list()).toHaveLength(2);
  });
});

describe('mapTwilioStatus', () => {
  it('maps provider statuses to delivery statuses', () => {
    expect(mapTwilioStatus('queued')).toBe('queued');
    expect(mapTwilioStatus('sent')).toBe('sent');
    expect(mapTwilioStatus('delivered')).toBe('delivered');
    expect(mapTwilioStatus('undelivered')).toBe('bounced');
    expect(mapTwilioStatus('failed')).toBe('failed');
    expect(mapTwilioStatus('nonsense')).toBeNull();
  });
});

describe('mapSesNotificationType', () => {
  it('maps SES notification types to delivery statuses', () => {
    expect(mapSesNotificationType('Delivery')).toBe('delivered');
    expect(mapSesNotificationType('Bounce')).toBe('bounced');
    expect(mapSesNotificationType('Complaint')).toBe('bounced');
    expect(mapSesNotificationType('Other')).toBeNull();
  });
});

describe('Twilio status controller', () => {
  const authToken = 'test-auth-token';
  const url = 'https://app.example.com/webhooks/twilio/status';

  function makeController() {
    const store = new InMemoryDeliveryTrackingStore();
    const service = new DeliveryTrackingService(store);
    const ControllerClass = createTwilioStatusController({ authToken }) as new (
      svc: DeliveryTrackingService,
    ) => { handle: (body: any, sig: string | undefined, req: any) => Promise<void> };
    return { store, service, controller: new ControllerClass(service) };
  }

  function req(body: Record<string, string>) {
    const u = new URL(url);
    return {
      protocol: u.protocol.replace(':', ''),
      headers: { host: u.host },
      originalUrl: u.pathname,
      body,
    };
  }

  it('accepts a valid signature and updates the matching record', async () => {
    const { store, controller } = makeController();
    const rec = await store.record({ channel: 'sms', notificationType: 'A', status: 'sent' });
    await store.setProviderMessageId(rec.id, 'SM999');

    const body = { MessageSid: 'SM999', MessageStatus: 'delivered' };
    // Build the signature the same way the controller verifies it.
    let data = url;
    for (const key of Object.keys(body).sort()) data += key + (body as Record<string, string>)[key];
    const signature = createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');
    expect(signature).toBe(computeTwilioSignature(authToken, url, body));

    await controller.handle(body, signature, req(body));
    expect((await store.get(rec.id))?.status).toBe('delivered');
  });

  it('maps undelivered to bounced and captures the error', async () => {
    const { store, controller } = makeController();
    const rec = await store.record({ channel: 'sms', notificationType: 'A', status: 'sent' });
    await store.setProviderMessageId(rec.id, 'SM111');

    const body = { MessageSid: 'SM111', MessageStatus: 'undelivered', ErrorCode: '30008' };
    const signature = computeTwilioSignature(authToken, url, body);
    await controller.handle(body, signature, req(body));

    const after = await store.get(rec.id);
    expect(after?.status).toBe('bounced');
    expect(after?.error).toBe('30008');
  });

  it('rejects an invalid signature with 403', async () => {
    const { controller } = makeController();
    const body = { MessageSid: 'SM999', MessageStatus: 'delivered' };
    await expect(controller.handle(body, 'wrong-signature', req(body))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a missing signature with 403', async () => {
    const { controller } = makeController();
    const body = { MessageSid: 'SM999', MessageStatus: 'delivered' };
    await expect(controller.handle(body, undefined, req(body))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('SES notification controller', () => {
  function makeController() {
    const store = new InMemoryDeliveryTrackingStore();
    const service = new DeliveryTrackingService(store);
    const ControllerClass = createSesNotificationController() as new (
      svc: DeliveryTrackingService,
    ) => { handle: (body: any) => Promise<void> };
    return { store, controller: new ControllerClass(service) };
  }

  it('updates the matching record from an SNS Notification', async () => {
    const { store, controller } = makeController();
    const rec = await store.record({ channel: 'mail', notificationType: 'A', status: 'sent' });
    await store.setProviderMessageId(rec.id, 'ses-msg-1');

    await controller.handle({
      Type: 'Notification',
      Message: JSON.stringify({
        notificationType: 'Bounce',
        mail: { messageId: 'ses-msg-1' },
      }),
    });

    expect((await store.get(rec.id))?.status).toBe('bounced');
  });

  it('ignores SubscriptionConfirmation when auto-confirm is off', async () => {
    const { controller } = makeController();
    await expect(
      controller.handle({ Type: 'SubscriptionConfirmation', SubscribeURL: 'https://x' }),
    ).resolves.toBeUndefined();
  });
});
