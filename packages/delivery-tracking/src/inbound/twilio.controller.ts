import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
  Req,
  type Type,
} from '@nestjs/common';
import { DeliveryTrackingService } from '../delivery-tracking.service';
import type { DeliveryStatus } from '../interfaces';

/** Options for {@link createTwilioStatusController}. */
export interface TwilioStatusControllerOptions {
  /** Twilio account auth token, used to verify the `X-Twilio-Signature` header. */
  authToken: string;
  /** Route path for the controller. Default `webhooks/twilio/status`. */
  path?: string;
}

/** Maps Twilio `MessageStatus` values onto our {@link DeliveryStatus}. */
export function mapTwilioStatus(messageStatus: string): DeliveryStatus | null {
  switch (messageStatus) {
    case 'queued':
    case 'accepted':
    case 'scheduled':
      return 'queued';
    case 'sending':
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'undelivered':
      return 'bounced';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

/**
 * Compute the Twilio request signature: HMAC-SHA1 (base64) of the full request URL with the POST
 * params appended in lexicographic key order (`key + value`), keyed by the auth token. See
 * https://www.twilio.com/docs/usage/security#validating-requests.
 */
export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Reconstructs the absolute URL Twilio signed, honoring a reverse proxy's forwarded headers. */
function requestUrl(req: any): string {
  const forwardedProto = req.headers?.['x-forwarded-proto'];
  const proto =
    (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : undefined) ??
    req.protocol ??
    'https';
  const host = req.headers?.['x-forwarded-host'] ?? req.headers?.host;
  return `${proto}://${host}${req.originalUrl ?? req.url ?? ''}`;
}

/**
 * Builds a `@Controller(...)` that ingests Twilio status callbacks. Twilio POSTs
 * `application/x-www-form-urlencoded` bodies (`MessageSid`, `MessageStatus`, ...) with an
 * `X-Twilio-Signature` header; the signature is verified against the reconstructed request URL +
 * sorted POST params using the account auth token. Invalid signatures are rejected with 403, and
 * valid callbacks update the tracking record via {@link DeliveryTrackingService.updateByProviderMessageId}.
 *
 * The host app must parse the urlencoded body (Nest/Express does this by default). Mount the
 * returned class in a module's `controllers`, alongside `DeliveryTrackingModule`.
 *
 * ```ts
 * const TwilioStatusController = createTwilioStatusController({ authToken: process.env.TWILIO_AUTH_TOKEN! });
 *
 * @Module({ controllers: [TwilioStatusController] })
 * export class WebhooksModule {}
 * ```
 */
export function createTwilioStatusController(
  options: TwilioStatusControllerOptions,
): Type<unknown> {
  const path = options.path ?? 'webhooks/twilio/status';

  @Controller(path)
  class TwilioStatusController {
    constructor(private readonly tracking: DeliveryTrackingService) {}

    @Post()
    @HttpCode(204)
    async handle(
      @Body() body: Record<string, string>,
      @Headers('x-twilio-signature') signature: string | undefined,
      @Req() req: any,
    ): Promise<void> {
      const params = body ?? {};
      const expected = computeTwilioSignature(options.authToken, requestUrl(req), params);
      if (!signature || !safeEqual(signature, expected)) {
        throw new ForbiddenException('Invalid Twilio signature');
      }

      const messageSid = params.MessageSid;
      const messageStatus = params.MessageStatus;
      if (!messageSid || !messageStatus) return;
      const status = mapTwilioStatus(messageStatus);
      if (!status) return;

      const error =
        status === 'failed' || status === 'bounced'
          ? (params.ErrorMessage ?? params.ErrorCode)
          : undefined;
      await this.tracking.updateByProviderMessageId(
        messageSid,
        status,
        error ? { error } : undefined,
      );
    }
  }

  return TwilioStatusController;
}
