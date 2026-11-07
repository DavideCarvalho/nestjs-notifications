import { type KeyObject, X509Certificate, verify } from 'node:crypto';

/**
 * Amazon SNS HTTP(S) message verification, following AWS's documented algorithm:
 * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 *
 * 1. Parse the JSON envelope SNS posts.
 * 2. Check `SigningCertURL` is an `https://` URL on an SNS host, ending in `.pem` — before any
 *    request is made.
 * 3. Fetch the X.509 certificate (cached by URL, bounded, with a timeout) and take its public key.
 * 4. Rebuild the canonical string-to-sign for the message `Type` (`key\nvalue\n` per field, in the
 *    fixed order AWS documents).
 * 5. Verify the base64 `Signature` with RSA: `SignatureVersion` `1` → SHA1withRSA, `2` →
 *    SHA256withRSA; any other version is rejected.
 *
 * On top of the signature, {@link SnsMessageVerifier} checks the `TopicArn` against an allowlist
 * (anyone can create an SNS topic and subscribe your endpoint, and SNS signs *their* messages too)
 * and that `Timestamp` is recent.
 */

/** Message types SNS posts to an HTTP(S) subscriber. */
export type SnsMessageType =
  | 'Notification'
  | 'SubscriptionConfirmation'
  | 'UnsubscribeConfirmation';

/** The JSON envelope SNS posts to an HTTP(S) endpoint. */
export interface SnsMessage {
  Type: SnsMessageType;
  MessageId: string;
  TopicArn: string;
  /** Only on `Notification`, and only when the publisher set one. */
  Subject?: string;
  Message: string;
  /** ISO-8601 time SNS published the message. */
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  /** `SubscriptionConfirmation` / `UnsubscribeConfirmation` only. */
  SubscribeURL?: string;
  /** `SubscriptionConfirmation` / `UnsubscribeConfirmation` only. */
  Token?: string;
  /** `Notification` only. */
  UnsubscribeURL?: string;
}

/** Loads the PEM text of the certificate at a (pre-validated) `SigningCertURL`. */
export type SnsCertificateLoader = (url: string) => Promise<string>;

/** Why a message was refused. */
export type SnsVerificationFailure =
  | 'malformed'
  | 'unsupported-type'
  | 'unsupported-signature-version'
  | 'invalid-cert-url'
  | 'cert-unavailable'
  | 'invalid-signature'
  | 'topic-not-allowed'
  | 'stale';

/** Thrown by {@link SnsMessageVerifier.verify} when a message must not be trusted. */
export class SnsVerificationError extends Error {
  constructor(
    readonly reason: SnsVerificationFailure,
    message: string,
  ) {
    super(message);
    this.name = 'SnsVerificationError';
  }
}

/**
 * SNS endpoint hosts, as published in AWS's endpoint list: `sns.<region>.amazonaws.com` in the
 * commercial and GovCloud (`us-gov-west-1`, …) partitions, `sns.<region>.amazonaws.com.cn` in the
 * China partition (`cn-north-1`, `cn-northwest-1`).
 */
const SNS_HOST = /^sns\.[a-z]{2}(?:-gov)?-[a-z]+-\d+\.amazonaws\.com(?:\.cn)?$/;

/**
 * Whether `value` is an `https://` URL on an SNS endpoint host (no credentials, no custom port).
 * The same check guards both `SigningCertURL` (which must also end in `.pem`) and `SubscribeURL`.
 */
export function isSnsUrl(value: unknown, opts: { pem?: boolean } = {}): boolean {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  if (!SNS_HOST.test(url.hostname)) return false;
  if (opts.pem && (!url.pathname.endsWith('.pem') || url.search || url.hash)) return false;
  return true;
}

const NOTIFICATION_FIELDS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
const SUBSCRIPTION_FIELDS = [
  'Message',
  'MessageId',
  'SubscribeURL',
  'Timestamp',
  'Token',
  'TopicArn',
  'Type',
];

/**
 * The canonical string SNS signs for a message: each field as `key\nvalue\n`, in byte order of the
 * key. `Notification` signs Message, MessageId, Subject (only when present), Timestamp, TopicArn,
 * Type; the two subscription types sign Message, MessageId, SubscribeURL, Timestamp, Token,
 * TopicArn, Type.
 */
export function buildSnsStringToSign(message: SnsMessage): string {
  const fields = message.Type === 'Notification' ? NOTIFICATION_FIELDS : SUBSCRIPTION_FIELDS;
  let out = '';
  for (const key of fields) {
    const value = (message as unknown as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue; // only `Subject` is optional
    out += `${key}\n${value}\n`;
  }
  return out;
}

const SIGNATURE_ALGORITHMS: Record<string, string> = { '1': 'sha1', '2': 'sha256' };
const MESSAGE_TYPES = new Set<string>([
  'Notification',
  'SubscriptionConfirmation',
  'UnsubscribeConfirmation',
]);

/**
 * Parses an SNS envelope from a JSON string, a Buffer or an already-parsed object. Throws
 * {@link SnsVerificationError} (`malformed` / `unsupported-type`) when a field the signature
 * covers is missing or not a string.
 */
export function parseSnsMessage(body: unknown): SnsMessage {
  let raw: unknown = body;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new SnsVerificationError('malformed', 'SNS message body is not valid JSON');
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SnsVerificationError('malformed', 'SNS message body is not a JSON object');
  }
  const msg = raw as Record<string, unknown>;
  if (typeof msg.Type !== 'string' || !MESSAGE_TYPES.has(msg.Type)) {
    throw new SnsVerificationError('unsupported-type', 'Unsupported SNS message Type');
  }
  const required = [
    'MessageId',
    'TopicArn',
    'Message',
    'Timestamp',
    'SignatureVersion',
    'Signature',
    'SigningCertURL',
    ...(msg.Type === 'Notification' ? [] : ['SubscribeURL', 'Token']),
  ];
  for (const key of required) {
    if (typeof msg[key] !== 'string') {
      throw new SnsVerificationError('malformed', `SNS message is missing ${key}`);
    }
  }
  if (msg.Subject !== undefined && msg.Subject !== null && typeof msg.Subject !== 'string') {
    throw new SnsVerificationError('malformed', 'SNS message Subject is not a string');
  }
  return msg as unknown as SnsMessage;
}

/** Options for {@link SnsMessageVerifier}. */
export interface SnsMessageVerifierOptions {
  /** Topic ARNs whose messages are accepted. Every other topic is refused. Must not be empty. */
  topicArns: readonly string[];
  /**
   * Maximum age of a message's `Timestamp`, in ms, or `false` to skip the check. Default one hour
   * (`3_600_000`). SNS keeps the original `Timestamp` across delivery retries, so this must exceed
   * your subscription's total retry window. Timestamps more than 5 minutes in the future are
   * refused too.
   */
  maxMessageAgeMs?: number | false | undefined;
  /**
   * Loads the PEM certificate at a `SigningCertURL` that already passed the host check. Default:
   * `fetch` over HTTPS with {@link certificateTimeoutMs}. Inject one in tests.
   */
  certificateLoader?: SnsCertificateLoader | undefined;
  /** Timeout for the default certificate fetch, in ms. Default `5000`. */
  certificateTimeoutMs?: number | undefined;
  /** How many certificates (by URL) to keep in memory. Default `20`. */
  certificateCacheSize?: number;
  /** Clock, for tests. Default `Date.now`. */
  now?: () => number;
}

const FUTURE_SKEW_MS = 5 * 60_000;
const MAX_CERT_BYTES = 64 * 1024;

/** Default {@link SnsCertificateLoader}: HTTPS GET with a timeout and a size cap. */
export function fetchSnsCertificate(timeoutMs = 5000): SnsCertificateLoader {
  return async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_CERT_BYTES) throw new Error('certificate too large');
    return text;
  };
}

/**
 * Verifies SNS messages: signature (v1 SHA1withRSA / v2 SHA256withRSA against the certificate
 * from an SNS-hosted `SigningCertURL`), topic allowlist and timestamp freshness. Certificates are
 * cached by URL (bounded, least-recently-used evicted; failed loads are not cached).
 */
export class SnsMessageVerifier {
  private readonly topicArns: ReadonlySet<string>;
  private readonly maxAgeMs: number | false;
  private readonly loader: SnsCertificateLoader;
  private readonly cacheSize: number;
  private readonly now: () => number;
  private readonly certs = new Map<string, Promise<KeyObject>>();

  constructor(options: SnsMessageVerifierOptions) {
    const topics = (options.topicArns ?? []).filter((arn) => typeof arn === 'string' && arn);
    if (topics.length === 0) {
      throw new Error('SnsMessageVerifier: `topicArns` must list at least one SNS topic ARN.');
    }
    this.topicArns = new Set(topics);
    this.maxAgeMs = options.maxMessageAgeMs ?? 3_600_000;
    this.loader = options.certificateLoader ?? fetchSnsCertificate(options.certificateTimeoutMs);
    this.cacheSize = Math.max(1, options.certificateCacheSize ?? 20);
    this.now = options.now ?? Date.now;
  }

  /**
   * Parses and verifies `body` (JSON string, Buffer or parsed object). Resolves with the message
   * when it is authentic, from an allowed topic and fresh; otherwise rejects with
   * {@link SnsVerificationError}.
   */
  async verify(body: unknown): Promise<SnsMessage> {
    const message = parseSnsMessage(body);
    this.checkClaims(message);
    await this.checkSignature(message);
    return message;
  }

  /** Topic and timestamp checks. Cheap, so they run before any certificate is fetched. */
  checkClaims(message: SnsMessage): void {
    if (!this.topicArns.has(message.TopicArn)) {
      throw new SnsVerificationError('topic-not-allowed', 'SNS TopicArn is not allowed');
    }
    if (this.maxAgeMs !== false) {
      const at = Date.parse(message.Timestamp);
      const now = this.now();
      if (Number.isNaN(at)) throw new SnsVerificationError('malformed', 'Invalid SNS Timestamp');
      if (now - at > this.maxAgeMs || at - now > FUTURE_SKEW_MS) {
        throw new SnsVerificationError(
          'stale',
          'SNS message Timestamp is outside the allowed window',
        );
      }
    }
  }

  /** Signature check (version, cert URL, certificate, RSA verify). */
  async checkSignature(message: SnsMessage): Promise<void> {
    const algorithm = SIGNATURE_ALGORITHMS[message.SignatureVersion];
    if (!algorithm) {
      throw new SnsVerificationError(
        'unsupported-signature-version',
        'Unsupported SNS SignatureVersion',
      );
    }
    if (!isSnsUrl(message.SigningCertURL, { pem: true })) {
      throw new SnsVerificationError(
        'invalid-cert-url',
        'SigningCertURL is not an SNS certificate URL',
      );
    }
    const key = await this.publicKey(message.SigningCertURL);
    let ok = false;
    try {
      ok = verify(
        algorithm,
        Buffer.from(buildSnsStringToSign(message), 'utf8'),
        key,
        Buffer.from(message.Signature, 'base64'),
      );
    } catch {
      ok = false;
    }
    if (!ok) throw new SnsVerificationError('invalid-signature', 'Invalid SNS message signature');
  }

  private publicKey(url: string): Promise<KeyObject> {
    const cached = this.certs.get(url);
    if (cached) {
      // Refresh recency.
      this.certs.delete(url);
      this.certs.set(url, cached);
      return cached;
    }
    const pending = this.load(url);
    this.certs.set(url, pending);
    while (this.certs.size > this.cacheSize) {
      const oldest = this.certs.keys().next().value as string;
      this.certs.delete(oldest);
    }
    pending.catch(() => {
      if (this.certs.get(url) === pending) this.certs.delete(url);
    });
    return pending;
  }

  private async load(url: string): Promise<KeyObject> {
    let cert: X509Certificate;
    try {
      cert = new X509Certificate(await this.loader(url));
    } catch (error) {
      throw new SnsVerificationError(
        'cert-unavailable',
        `Could not load SNS signing certificate: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const now = this.now();
    if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) {
      throw new SnsVerificationError(
        'cert-unavailable',
        'SNS signing certificate is not valid now',
      );
    }
    return cert.publicKey;
  }
}

/** Remembers which SNS `MessageId`s were already processed (SNS delivers at least once). */
export interface SnsMessageIdStore {
  /** Whether `messageId` was already processed. */
  has(messageId: string): boolean | Promise<boolean>;
  /** Mark `messageId` processed; it may be forgotten after `ttlMs`. */
  add(messageId: string, ttlMs: number): void | Promise<void>;
}

/** Bounded in-memory {@link SnsMessageIdStore}: one process only, oldest ids dropped first. */
export class InMemorySnsMessageIdStore implements SnsMessageIdStore {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly maxSize = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  has(messageId: string): boolean {
    const expires = this.seen.get(messageId);
    if (expires === undefined) return false;
    if (expires <= this.now()) {
      this.seen.delete(messageId);
      return false;
    }
    return true;
  }

  add(messageId: string, ttlMs: number): void {
    this.seen.delete(messageId);
    this.seen.set(messageId, this.now() + ttlMs);
    while (this.seen.size > this.maxSize) {
      this.seen.delete(this.seen.keys().next().value as string);
    }
  }
}
