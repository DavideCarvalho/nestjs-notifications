import {
  Controller,
  ForbiddenException,
  HttpCode,
  Logger,
  Post,
  Req,
  type Type,
} from '@nestjs/common';
import { finishController } from '../controller-decorators';
import { DeliveryTrackingService } from '../delivery-tracking.service';
import type { DeliveryStatus } from '../interfaces';
import {
  InMemorySnsMessageIdStore,
  type SnsCertificateLoader,
  type SnsMessage,
  type SnsMessageIdStore,
  SnsMessageVerifier,
  SnsVerificationError,
  isSnsUrl,
  parseSnsMessage,
} from './sns-message-verifier';

/** Options for {@link createSesNotificationController}. */
export interface SesNotificationControllerOptions {
  /**
   * ARNs of the SNS topics SES publishes to. Required and non-empty: messages from any other topic
   * are refused with 403 — anyone can create a topic and subscribe your endpoint, and SNS signs
   * those messages too, so the signature alone does not say the event is yours.
   */
  topicArns: string[];
  /** Route path for the controller. Default `webhooks/ses`. */
  path?: string;
  /**
   * Confirm the SNS subscription by GET-ing its `SubscribeURL` when a verified
   * `SubscriptionConfirmation` arrives (only if that URL is an `https://` SNS host). Default
   * false: confirm it yourself — from `onSubscriptionConfirmation`, the AWS console or the CLI.
   */
  autoConfirmSubscription?: boolean;
  /**
   * Called with every verified `SubscriptionConfirmation` (before the auto-confirm, if on). Use
   * it to confirm out-of-band, or to log/alert. If it throws, the request fails (SNS retries).
   */
  onSubscriptionConfirmation?: (message: SnsMessage) => void | Promise<void>;
  /**
   * Verify the SNS message signature. Default true. Set `false` only when something in front of
   * this route already verifies SNS signatures — the topic and timestamp checks still apply.
   */
  verifySignature?: boolean;
  /**
   * Maximum age of the message `Timestamp`, in ms, or `false` to skip. Default one hour. SNS keeps
   * the original timestamp across retries, so keep this above your delivery retry window.
   */
  maxMessageAgeMs?: number | false;
  /**
   * Skip messages whose `MessageId` was already processed (SNS delivers at least once). Default:
   * a per-controller, in-memory, bounded store. Pass your own (e.g. Redis-backed) to share it
   * across instances, or `false` to turn it off.
   */
  messageIdStore?: SnsMessageIdStore | false;
  /** Loads the PEM at a validated `SigningCertURL`. Default: HTTPS `fetch`. Inject in tests. */
  certificateLoader?: SnsCertificateLoader;
  /** Timeout for the default certificate fetch, in ms. Default `5000`. */
  certificateTimeoutMs?: number;
  /** `fetch` used to GET the `SubscribeURL`. Default global `fetch`. Inject in tests. */
  fetch?: (url: string) => Promise<{ ok: boolean; status: number }>;
  /**
   * Class decorators applied to the controller, in order, after its own (e.g. an IP-allowlist
   * guard via `UseGuards(...)`). The controller is marked open to `@nestjs/authorization`'s
   * deny-by-default guard (`Can.Anyone()`), since the provider calling it has no user: it
   * authenticates by the SNS message signature instead. A `@Can()` passed here is still enforced.
   */
  decorators?: ClassDecorator[];
}

/** Maps an SES SNS notificationType onto our {@link DeliveryStatus}. */
export function mapSesNotificationType(notificationType: string): DeliveryStatus | null {
  switch (notificationType) {
    case 'Delivery':
      return 'delivered';
    case 'Bounce':
    case 'Complaint':
      return 'bounced';
    default:
      return null;
  }
}

/**
 * Reads the request body whatever parser the app runs. SNS posts JSON with
 * `Content-Type: text/plain; charset=UTF-8`, which Nest's default Express parsers (json,
 * urlencoded) leave unread: the stream is then read here. A string (text parser, Fastify's
 * default `text/plain` parser), a Buffer (raw parser, `rawBody: true`) or an already-parsed
 * object (a JSON parser accepting `text/plain`) are used as they are.
 */
async function readBody(req: any): Promise<unknown> {
  if (Buffer.isBuffer(req?.rawBody)) return req.rawBody;
  const body = req?.body;
  if (typeof body === 'string' || Buffer.isBuffer(body)) return body;
  if (body && typeof body === 'object' && Object.keys(body).length > 0) return body;
  const stream = req?.raw ?? req;
  if (stream && typeof stream.on === 'function' && stream.readable && !stream.readableEnded) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > MAX_BODY_BYTES) throw new ForbiddenException('SNS message too large');
      chunks.push(buf);
    }
    return Buffer.concat(chunks);
  }
  return body;
}

const MAX_BODY_BYTES = 256 * 1024 + 16 * 1024; // SNS messages are at most 256 KiB, plus envelope.

/**
 * Builds a `@Controller(...)` that ingests AWS SES bounce/complaint/delivery events delivered via
 * SNS. Every message is verified before anything happens — SNS signature (v1 SHA1withRSA, v2
 * SHA256withRSA, certificate fetched only from an `https://sns.<region>.amazonaws.com[.cn]/….pem`
 * URL), `TopicArn` in `topicArns`, recent `Timestamp` — and refused with 403 otherwise.
 *
 * - `SubscriptionConfirmation`: passed to `onSubscriptionConfirmation`, and confirmed by GET-ing
 *   `SubscribeURL` when `autoConfirmSubscription` is on.
 * - `Notification`: the inner SES event's `notificationType` is mapped to a
 *   {@link DeliveryStatus} and correlated via `mail.messageId` against
 *   {@link DeliveryTrackingService.updateByProviderMessageId}. Already-seen `MessageId`s are skipped.
 *
 * ```ts
 * const SesController = createSesNotificationController({
 *   topicArns: [process.env.SES_EVENTS_TOPIC_ARN!],
 *   autoConfirmSubscription: true,
 * });
 *
 * @Module({ controllers: [SesController] })
 * export class WebhooksModule {}
 * ```
 */
export function createSesNotificationController(
  options: SesNotificationControllerOptions,
): Type<unknown> {
  const path = options.path ?? 'webhooks/ses';
  const verifier = new SnsMessageVerifier({
    topicArns: options.topicArns,
    maxMessageAgeMs: options.maxMessageAgeMs,
    certificateLoader: options.certificateLoader,
    certificateTimeoutMs: options.certificateTimeoutMs,
  });
  const verifySignature = options.verifySignature ?? true;
  const dedupe =
    options.messageIdStore === false
      ? null
      : (options.messageIdStore ?? new InMemorySnsMessageIdStore());
  const dedupeTtlMs =
    typeof options.maxMessageAgeMs === 'number' ? options.maxMessageAgeMs : 3_600_000;
  const doFetch = options.fetch ?? ((url: string) => fetch(url));

  @Controller(path)
  class SesNotificationController {
    private readonly logger = new Logger(SesNotificationController.name);

    constructor(private readonly tracking: DeliveryTrackingService) {}

    @Post()
    @HttpCode(204)
    async handle(@Req() req: any): Promise<void> {
      let message: SnsMessage;
      try {
        message = parseSnsMessage(await readBody(req));
        verifier.checkClaims(message);
        if (verifySignature) await verifier.checkSignature(message);
      } catch (error) {
        if (!(error instanceof SnsVerificationError)) throw error;
        this.logger.warn(`SES controller: refused SNS message (${error.reason}).`);
        throw new ForbiddenException('Invalid SNS message');
      }

      if (message.Type === 'SubscriptionConfirmation') {
        await this.confirm(message);
        return;
      }
      if (message.Type !== 'Notification') return; // UnsubscribeConfirmation: nothing to do.

      if (dedupe && (await dedupe.has(message.MessageId))) return;
      await this.ingest(message);
      if (dedupe) await dedupe.add(message.MessageId, dedupeTtlMs);
    }

    private async confirm(message: SnsMessage): Promise<void> {
      if (options.onSubscriptionConfirmation) await options.onSubscriptionConfirmation(message);
      if (!options.autoConfirmSubscription) {
        if (!options.onSubscriptionConfirmation) {
          this.logger.log(
            `SES controller: SNS subscription to ${message.TopicArn} awaits confirmation (autoConfirmSubscription is off).`,
          );
        }
        return;
      }
      if (!isSnsUrl(message.SubscribeURL)) {
        this.logger.warn('SES controller: SubscribeURL is not an SNS URL; not confirming.');
        return;
      }
      try {
        const res = await doFetch(message.SubscribeURL as string);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (error) {
        this.logger.error(`SES controller: failed to confirm SNS subscription: ${describe(error)}`);
      }
    }

    private async ingest(envelope: SnsMessage): Promise<void> {
      let event: { notificationType?: string; eventType?: string; mail?: { messageId?: string } };
      try {
        event = JSON.parse(envelope.Message);
      } catch {
        this.logger.error('SES controller: SNS Message was not valid JSON.');
        return;
      }
      const type = event?.notificationType ?? event?.eventType;
      const status = type ? mapSesNotificationType(type) : null;
      const messageId = event?.mail?.messageId;
      if (!status || !messageId) return;
      await this.tracking.updateByProviderMessageId(messageId, status);
    }
  }

  finishController(SesNotificationController, options.decorators);
  return SesNotificationController;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
