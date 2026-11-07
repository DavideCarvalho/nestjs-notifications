import { type KeyObject, generateKeyPairSync, sign } from 'node:crypto';
import { type SnsMessage, buildSnsStringToSign } from './sns-message-verifier';

/**
 * Test-only helpers (not exported from the package): a real RSA key pair and a self-signed X.509
 * certificate built with a tiny DER encoder, so SNS signatures are produced and checked with the
 * real algorithms and no extra dependency.
 *
 * @internal
 */

function len(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag: number, body: Buffer) =>
  Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]) => tlv(0x31, Buffer.concat(parts));
const int = (n: number) => tlv(0x02, Buffer.from([n]));
const nul = () => Buffer.from([0x05, 0x00]);
function oid(dotted: string): Buffer {
  const [a, b, ...rest] = dotted.split('.').map(Number) as [number, number, ...number[]];
  const out = [a * 40 + b];
  for (const part of rest) {
    const stack = [part & 0x7f];
    for (let v = part >> 7; v > 0; v >>= 7) stack.unshift((v & 0x7f) | 0x80);
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}
function utcTime(d: Date): Buffer {
  const p = (n: number) => String(n).padStart(2, '0');
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(s, 'ascii'));
}
const name = (cn: string) => seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(cn, 'utf8')))));

export interface TestSigner {
  certPem: string;
  privateKey: KeyObject;
}

/** RSA-2048 key pair + a self-signed `CN=sns.amazonaws.com` certificate valid around `now`. */
export function createTestSigner(now = Date.now()): TestSigner {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sha256WithRsa = seq(oid('1.2.840.113549.1.1.11'), nul());
  const subject = name('sns.amazonaws.com');
  const tbs = seq(
    tlv(0xa0, int(2)), // v3
    int(1),
    sha256WithRsa,
    subject,
    seq(utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 86_400_000))),
    subject,
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const signature = sign('sha256', tbs, privateKey);
  const der = seq(tbs, sha256WithRsa, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])));
  const b64 = der.toString('base64').replace(/.{1,64}/g, '$&\n');
  return { certPem: `-----BEGIN CERTIFICATE-----\n${b64}-----END CERTIFICATE-----\n`, privateKey };
}

export const TEST_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:ses-events';
export const TEST_CERT_URL =
  'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-0000000000000000000000000000000.pem';

/** Signs `fields` as SNS would (`SignatureVersion` 1 → SHA1, 2 → SHA256). */
export function signSnsMessage(
  signer: TestSigner,
  fields: Omit<SnsMessage, 'Signature' | 'SignatureVersion' | 'SigningCertURL'> &
    Partial<Pick<SnsMessage, 'SignatureVersion' | 'SigningCertURL'>>,
): SnsMessage {
  const message = {
    SignatureVersion: '2',
    SigningCertURL: TEST_CERT_URL,
    ...fields,
    Signature: '',
  } as SnsMessage;
  const algorithm = message.SignatureVersion === '1' ? 'sha1' : 'sha256';
  message.Signature = sign(
    algorithm,
    Buffer.from(buildSnsStringToSign(message), 'utf8'),
    signer.privateKey,
  ).toString('base64');
  return message;
}

/** A signed SES-over-SNS `Notification` for `sesMessageId`. */
export function sesNotification(
  signer: TestSigner,
  sesMessageId: string,
  notificationType = 'Delivery',
  overrides: Partial<SnsMessage> = {},
): SnsMessage {
  return signSnsMessage(signer, {
    Type: 'Notification',
    MessageId: `sns-${Math.random().toString(36).slice(2)}`,
    TopicArn: TEST_TOPIC_ARN,
    Message: JSON.stringify({ notificationType, mail: { messageId: sesMessageId } }),
    Timestamp: new Date().toISOString(),
    ...overrides,
  });
}
