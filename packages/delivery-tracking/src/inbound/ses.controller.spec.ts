import { X509Certificate } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DeliveryTrackingService } from '../delivery-tracking.service';
import { InMemoryDeliveryTrackingStore } from '../in-memory.store';
import {
  type SesNotificationControllerOptions,
  createSesNotificationController,
} from './ses.controller';
import {
  type SnsMessage,
  SnsMessageVerifier,
  buildSnsStringToSign,
  isSnsUrl,
} from './sns-message-verifier';
import {
  TEST_CERT_URL,
  TEST_TOPIC_ARN,
  createTestSigner,
  sesNotification,
  signSnsMessage,
} from './sns-test-fixtures';

const signer = createTestSigner();

function make(overrides: Partial<SesNotificationControllerOptions> = {}) {
  const store = new InMemoryDeliveryTrackingStore();
  const certificateLoader = vi.fn(async (_url: string) => signer.certPem);
  const ControllerClass = createSesNotificationController({
    topicArns: [TEST_TOPIC_ARN],
    certificateLoader,
    ...overrides,
  }) as new (
    svc: DeliveryTrackingService,
  ) => { handle: (req: any) => Promise<void> };
  const controller = new ControllerClass(new DeliveryTrackingService(store));
  const post = (body: unknown) => controller.handle({ body });
  return { store, controller, post, certificateLoader };
}

async function tracked(store: InMemoryDeliveryTrackingStore, sesMessageId: string) {
  const rec = await store.record({ channel: 'mail', notificationType: 'A', status: 'sent' });
  await store.setProviderMessageId(rec.id, sesMessageId);
  return rec;
}

function subscriptionConfirmation(overrides: Partial<SnsMessage> = {}): SnsMessage {
  return signSnsMessage(signer, {
    Type: 'SubscriptionConfirmation',
    MessageId: 'sub-1',
    Token: 'token-123',
    TopicArn: TEST_TOPIC_ARN,
    Message: 'You have chosen to subscribe to the topic.',
    SubscribeURL: `https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${TEST_TOPIC_ARN}&Token=token-123`,
    Timestamp: new Date().toISOString(),
    ...overrides,
  });
}

describe('test fixtures', () => {
  it('produce a real, self-signed X.509 certificate', () => {
    const cert = new X509Certificate(signer.certPem);
    expect(cert.subject).toContain('sns.amazonaws.com');
    expect(cert.verify(cert.publicKey)).toBe(true);
  });
});

describe('buildSnsStringToSign', () => {
  it('builds the Notification string in AWS order, Subject only when present', () => {
    const base = {
      Type: 'Notification',
      MessageId: 'm',
      TopicArn: 't',
      Message: 'hello',
      Timestamp: 'ts',
      SignatureVersion: '1',
      Signature: '',
      SigningCertURL: '',
      UnsubscribeURL: 'u',
    } as SnsMessage;
    expect(buildSnsStringToSign(base)).toBe(
      'Message\nhello\nMessageId\nm\nTimestamp\nts\nTopicArn\nt\nType\nNotification\n',
    );
    expect(buildSnsStringToSign({ ...base, Subject: 's' })).toBe(
      'Message\nhello\nMessageId\nm\nSubject\ns\nTimestamp\nts\nTopicArn\nt\nType\nNotification\n',
    );
  });

  it('builds the subscription string with SubscribeURL and Token', () => {
    const msg = {
      Type: 'SubscriptionConfirmation',
      MessageId: 'm',
      TopicArn: 't',
      Message: 'x',
      Timestamp: 'ts',
      SubscribeURL: 'su',
      Token: 'tk',
    } as SnsMessage;
    expect(buildSnsStringToSign(msg)).toBe(
      'Message\nx\nMessageId\nm\nSubscribeURL\nsu\nTimestamp\nts\nToken\ntk\nTopicArn\nt\nType\nSubscriptionConfirmation\n',
    );
  });
});

describe('isSnsUrl', () => {
  it.each([
    ['https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem', true],
    ['https://sns.eu-west-3.amazonaws.com/SimpleNotificationService-abc.pem', true],
    ['https://sns.us-gov-west-1.amazonaws.com/SimpleNotificationService-abc.pem', true],
    ['https://sns.cn-north-1.amazonaws.com.cn/SimpleNotificationService-abc.pem', true],
    ['http://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem', false],
    ['https://sns.us-east-1.amazonaws.com.evil.com/cert.pem', false],
    ['https://evil.com/sns.us-east-1.amazonaws.com/cert.pem', false],
    ['https://sns.us-east-1.amazonaws.com:8443/cert.pem', false],
    ['https://user@sns.us-east-1.amazonaws.com/cert.pem', false],
    ['https://sns.us-east-1.amazonaws.com/cert.txt', false],
    ['https://sns.us-east-1.amazonaws.com/cert.pem?x=1', false],
    ['https://s3.amazonaws.com/cert.pem', false],
    ['https://snsXus-east-1.amazonaws.com/cert.pem', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isSnsUrl(url, { pem: true })).toBe(expected);
  });
});

describe('SES notification controller', () => {
  it('requires at least one topic ARN', () => {
    expect(() => createSesNotificationController({ topicArns: [] })).toThrow(/topicArns/);
  });

  it('accepts a v2 (SHA256withRSA) notification and updates the delivery status', async () => {
    const { store, post, certificateLoader } = make();
    const rec = await tracked(store, 'ses-1');
    await post(sesNotification(signer, 'ses-1', 'Delivery'));
    expect((await store.get(rec.id))?.status).toBe('delivered');
    expect(certificateLoader).toHaveBeenCalledWith(TEST_CERT_URL);
  });

  it('accepts a v1 (SHA1withRSA) notification', async () => {
    const { store, post } = make();
    const rec = await tracked(store, 'ses-2');
    await post(sesNotification(signer, 'ses-2', 'Bounce', { SignatureVersion: '1' }));
    expect((await store.get(rec.id))?.status).toBe('bounced');
  });

  it('accepts a signed notification that carries a Subject', async () => {
    const { store, post } = make();
    const rec = await tracked(store, 'ses-3');
    await post(
      sesNotification(signer, 'ses-3', 'Complaint', { Subject: 'Amazon SES Email Event' }),
    );
    expect((await store.get(rec.id))?.status).toBe('bounced');
  });

  it('reads a raw text/plain body (string or Buffer)', async () => {
    const { store, controller } = make();
    const rec = await tracked(store, 'ses-4');
    const raw = JSON.stringify(sesNotification(signer, 'ses-4'));
    await controller.handle({ body: Buffer.from(raw) });
    expect((await store.get(rec.id))?.status).toBe('delivered');
    await expect(controller.handle({ body: raw })).resolves.toBeUndefined();
  });

  it('caches the certificate by URL', async () => {
    const { store, post, certificateLoader } = make();
    await tracked(store, 'ses-5');
    await post(sesNotification(signer, 'ses-5'));
    await post(sesNotification(signer, 'ses-5'));
    expect(certificateLoader).toHaveBeenCalledTimes(1);
  });

  it('rejects a bad signature with 403 and records nothing', async () => {
    const { store, post } = make();
    const rec = await tracked(store, 'ses-6');
    const msg = sesNotification(signer, 'ses-6', 'Bounce');
    const forged = {
      ...msg,
      Message: JSON.stringify({ notificationType: 'Delivery', mail: { messageId: 'ses-6' } }),
    };
    await expect(post(forged)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await store.get(rec.id))?.status).toBe('sent');
  });

  it('rejects a signature made by another key', async () => {
    const { post } = make();
    const other = createTestSigner();
    await expect(post(sesNotification(other, 'x'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a cert URL on a non-SNS host without fetching it', async () => {
    const { post, certificateLoader } = make();
    const msg = sesNotification(signer, 'x', 'Delivery', {
      SigningCertURL: 'https://evil.example.com/SimpleNotificationService-x.pem',
    });
    await expect(post(msg)).rejects.toBeInstanceOf(ForbiddenException);
    expect(certificateLoader).not.toHaveBeenCalled();
  });

  it('rejects an http:// cert URL without fetching it', async () => {
    const { post, certificateLoader } = make();
    const msg = sesNotification(signer, 'x', 'Delivery', {
      SigningCertURL: TEST_CERT_URL.replace('https:', 'http:'),
    });
    await expect(post(msg)).rejects.toBeInstanceOf(ForbiddenException);
    expect(certificateLoader).not.toHaveBeenCalled();
  });

  it('rejects an unsupported SignatureVersion', async () => {
    const { post } = make();
    const msg = sesNotification(signer, 'x', 'Delivery', { SignatureVersion: '3' });
    await expect(post(msg)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a message from a topic that is not allowed, without fetching the cert', async () => {
    const { store, post, certificateLoader } = make();
    const rec = await tracked(store, 'ses-7');
    const msg = sesNotification(signer, 'ses-7', 'Delivery', {
      TopicArn: 'arn:aws:sns:us-east-1:999999999999:attacker',
    });
    await expect(post(msg)).rejects.toBeInstanceOf(ForbiddenException);
    expect(certificateLoader).not.toHaveBeenCalled();
    expect((await store.get(rec.id))?.status).toBe('sent');
  });

  it('rejects a stale timestamp', async () => {
    const { store, post } = make();
    const rec = await tracked(store, 'ses-8');
    const msg = sesNotification(signer, 'ses-8', 'Delivery', {
      Timestamp: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    });
    await expect(post(msg)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await store.get(rec.id))?.status).toBe('sent');
  });

  it('honours a custom maxMessageAgeMs, and false turns the check off', async () => {
    const old = { Timestamp: new Date(Date.now() - 2 * 60_000).toISOString() };
    await expect(
      make({ maxMessageAgeMs: 60_000 }).post(sesNotification(signer, 'x', 'Delivery', old)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const ancient = { Timestamp: new Date(Date.now() - 10 * 3_600_000).toISOString() };
    await expect(
      make({ maxMessageAgeMs: false }).post(sesNotification(signer, 'x', 'Delivery', ancient)),
    ).resolves.toBeUndefined();
  });

  it('rejects malformed bodies and unknown types with 403', async () => {
    const { post } = make();
    await expect(post('not json')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(post({})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(post({ Type: 'Notification', Message: '{}' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(post({ ...sesNotification(signer, 'x'), Type: 'Other' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when the certificate cannot be loaded, and retries the load next time', async () => {
    const certificateLoader = vi
      .fn<(url: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(signer.certPem);
    const { post } = make({ certificateLoader });
    await expect(post(sesNotification(signer, 'x'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(post(sesNotification(signer, 'x'))).resolves.toBeUndefined();
    expect(certificateLoader).toHaveBeenCalledTimes(2);
  });

  it('skips a MessageId it already processed', async () => {
    const { store, post } = make();
    const rec = await tracked(store, 'ses-9');
    const msg = sesNotification(signer, 'ses-9', 'Delivery');
    await post(msg);
    await store.updateStatus(rec.id, 'sent');
    await post(msg); // SNS redelivery
    expect((await store.get(rec.id))?.status).toBe('sent');
  });

  it('remembers MessageIds for messageIdTtlMs (default 24 h), also with maxMessageAgeMs: false', async () => {
    const added: Array<[string, number]> = [];
    const messageIdStore = {
      has: () => false,
      add: (id: string, ttl: number) => {
        added.push([id, ttl]);
      },
    };
    await make({ maxMessageAgeMs: false, messageIdStore }).post(sesNotification(signer, 'a'));
    await make({ maxMessageAgeMs: 60_000, messageIdStore }).post(sesNotification(signer, 'b'));
    await make({ messageIdTtlMs: 5_000, messageIdStore }).post(sesNotification(signer, 'c'));
    // Never shorter than the freshness window: a message still accepted is still deduplicated.
    await make({ messageIdTtlMs: 5_000, maxMessageAgeMs: 7_200_000, messageIdStore }).post(
      sesNotification(signer, 'd'),
    );
    expect(added.map(([, ttl]) => ttl)).toEqual([86_400_000, 86_400_000, 5_000, 7_200_000]);
  });

  it('verifySignature: false skips only the signature (topic still enforced)', async () => {
    const { store, post, certificateLoader } = make({ verifySignature: false });
    const rec = await tracked(store, 'ses-10');
    await post({ ...sesNotification(signer, 'ses-10'), Signature: 'bogus' });
    expect((await store.get(rec.id))?.status).toBe('delivered');
    expect(certificateLoader).not.toHaveBeenCalled();
    await expect(
      post({ ...sesNotification(signer, 'ses-10'), TopicArn: 'arn:aws:sns:us-east-1:1:other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('SubscriptionConfirmation', () => {
    it('is verified and auto-confirmed by GET-ing the SubscribeURL', async () => {
      const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
      const { post } = make({ autoConfirmSubscription: true, fetch });
      const msg = subscriptionConfirmation();
      await post(msg);
      expect(fetch).toHaveBeenCalledWith(msg.SubscribeURL, {
        redirect: 'error',
        signal: expect.any(AbortSignal),
      });
    });

    it('accepts a v1-signed confirmation', async () => {
      const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
      const { post } = make({ autoConfirmSubscription: true, fetch });
      await post(subscriptionConfirmation({ SignatureVersion: '1' }));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('is surfaced to onSubscriptionConfirmation, not fetched when auto-confirm is off', async () => {
      const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
      const onSubscriptionConfirmation = vi.fn();
      const { post } = make({ fetch, onSubscriptionConfirmation });
      const msg = subscriptionConfirmation();
      await post(msg);
      expect(onSubscriptionConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ Token: 'token-123' }),
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('is not confirmed when its signature is bad', async () => {
      const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
      const onSubscriptionConfirmation = vi.fn();
      const { post } = make({ autoConfirmSubscription: true, fetch, onSubscriptionConfirmation });
      const msg = { ...subscriptionConfirmation(), Token: 'tampered' };
      await expect(post(msg)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fetch).not.toHaveBeenCalled();
      expect(onSubscriptionConfirmation).not.toHaveBeenCalled();
    });

    it('is not confirmed for a topic that is not allowed', async () => {
      const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
      const { post } = make({ autoConfirmSubscription: true, fetch });
      const msg = subscriptionConfirmation({
        TopicArn: 'arn:aws:sns:us-east-1:999999999999:attacker',
      });
      await expect(post(msg)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('answers 502 when the confirm GET fails, so SNS redelivers it', async () => {
      const fetch = vi
        .fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>>()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
        .mockResolvedValue({ ok: true, status: 200 });
      const { post } = make({ autoConfirmSubscription: true, fetch });
      const msg = subscriptionConfirmation();
      await expect(post(msg)).rejects.toBeInstanceOf(BadGatewayException);
      await expect(post(msg)).rejects.toBeInstanceOf(BadGatewayException);
      await expect(post(msg)).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('times out a hung confirm GET (default fetch, confirmTimeoutMs)', async () => {
      const server = createServer(() => {
        /* never answers */
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      // The real global fetch with the init the controller passes, pointed at a local server.
      const fetch = vi.fn((_url: string, init?: RequestInit) =>
        globalThis.fetch(`http://127.0.0.1:${port}/`, init),
      );
      try {
        const { post } = make({ autoConfirmSubscription: true, fetch, confirmTimeoutMs: 100 });
        await expect(post(subscriptionConfirmation())).rejects.toBeInstanceOf(BadGatewayException);
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('does not GET a signed SubscribeURL that is not on an SNS host', async () => {
      const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
      const { post } = make({ autoConfirmSubscription: true, fetch });
      await post(subscriptionConfirmation({ SubscribeURL: 'https://evil.example.com/confirm' }));
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

describe('SnsMessageVerifier', () => {
  it('bounds the certificate cache', async () => {
    const certificateLoader = vi.fn(async () => signer.certPem);
    const verifier = new SnsMessageVerifier({
      topicArns: [TEST_TOPIC_ARN],
      certificateLoader,
      certificateCacheSize: 1,
    });
    const urlA = TEST_CERT_URL;
    const urlB = TEST_CERT_URL.replace('us-east-1', 'eu-west-1');
    await verifier.verify(sesNotification(signer, 'x', 'Delivery', { SigningCertURL: urlA }));
    await verifier.verify(sesNotification(signer, 'x', 'Delivery', { SigningCertURL: urlB }));
    await verifier.verify(sesNotification(signer, 'x', 'Delivery', { SigningCertURL: urlA }));
    expect(certificateLoader).toHaveBeenCalledTimes(3);
  });
});
