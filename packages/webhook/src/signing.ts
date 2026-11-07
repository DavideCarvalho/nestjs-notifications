import { createHmac } from 'node:crypto';

/**
 * Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,…`) for
 * `body`, verifiable by a `@nestjs/webhooks` receiver with `scheme: 'standard'` (`@VerifyWebhook`).
 * `secret` is `whsec_` + base64 (the prefix is optional).
 */
export function standardWebhookHeaders(
  secret: string,
  id: string,
  body: string,
  now: Date = new Date(),
): Record<string, string> {
  const timestamp = Math.floor(now.getTime() / 1000);
  const encoded = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(encoded, 'base64');
  if (key.length < 24 || key.length > 64) {
    throw new TypeError(
      'A Standard Webhooks secret is `whsec_` followed by base64 of 24 to 64 random bytes.',
    );
  }
  const signature = createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(body)
    .digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  };
}

/** The legacy `sha256=<hex HMAC of the body>` signature (GitHub-style). */
export function sha256Signature(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}
