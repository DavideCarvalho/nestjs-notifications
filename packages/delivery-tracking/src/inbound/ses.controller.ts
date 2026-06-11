import { Body, Controller, HttpCode, Logger, Post, type Type } from '@nestjs/common';
import { DeliveryTrackingService } from '../delivery-tracking.service';
import type { DeliveryStatus } from '../interfaces';

/** Options for {@link createSesNotificationController}. */
export interface SesNotificationControllerOptions {
  /** Route path for the controller. Default `webhooks/ses`. */
  path?: string;
  /**
   * Auto-confirm the SNS subscription by GET-ing the `SubscribeURL` on a
   * `SubscriptionConfirmation` message (best-effort). Default false — confirm the subscription
   * manually or out-of-band when this is off.
   */
  autoConfirmSubscription?: boolean;
  /**
   * Verify the SNS message signature before acting on it. Default false.
   *
   * TODO: SNS signature verification is non-trivial (fetch the `SigningCertURL` cert, rebuild the
   * canonical string-to-sign from the message fields in a fixed order, RSA-SHA1/256 verify). It is
   * intentionally not implemented here to avoid a heavy SNS-verify dependency. When false, this
   * endpoint trusts the payload — protect it another way (private network, secret path, an
   * upstream verifier) until verification is wired up.
   */
  verifySignature?: boolean;
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

/** Shape of the SNS envelope SES posts (only the fields we use). */
interface SnsEnvelope {
  Type?: string;
  Message?: string;
  SubscribeURL?: string;
}

/**
 * Builds a `@Controller(...)` that ingests AWS SES bounce/complaint/delivery events delivered via
 * SNS (JSON body). On `SubscriptionConfirmation` it can auto-confirm by GET-ing the `SubscribeURL`
 * (when `autoConfirmSubscription`). On `Notification` it parses the inner `Message` JSON, maps the
 * SES `notificationType` to a {@link DeliveryStatus}, and correlates via the SES `mail.messageId`
 * against {@link DeliveryTrackingService.updateByProviderMessageId}.
 *
 * Note: SNS signature verification is gated behind `verifySignature` (default false, not yet
 * implemented — see {@link SesNotificationControllerOptions.verifySignature}).
 *
 * ```ts
 * const SesController = createSesNotificationController({ autoConfirmSubscription: true });
 *
 * @Module({ controllers: [SesController] })
 * export class WebhooksModule {}
 * ```
 */
export function createSesNotificationController(
  options: SesNotificationControllerOptions = {},
): Type<unknown> {
  const path = options.path ?? 'webhooks/ses';

  @Controller(path)
  class SesNotificationController {
    private readonly logger = new Logger(SesNotificationController.name);

    constructor(private readonly tracking: DeliveryTrackingService) {}

    @Post()
    @HttpCode(204)
    async handle(@Body() body: SnsEnvelope): Promise<void> {
      if (options.verifySignature) {
        // TODO: implement SNS signature verification (see SesNotificationControllerOptions).
        this.logger.warn(
          'SES controller: verifySignature is enabled but SNS signature verification is not implemented; payload is being trusted.',
        );
      }

      if (body?.Type === 'SubscriptionConfirmation') {
        if (options.autoConfirmSubscription && body.SubscribeURL) {
          try {
            await fetch(body.SubscribeURL);
          } catch (error) {
            this.logger.error(
              `SES controller: failed to confirm SNS subscription: ${describe(error)}`,
            );
          }
        }
        return;
      }

      if (body?.Type !== 'Notification' || !body.Message) return;

      let message: { notificationType?: string; mail?: { messageId?: string } };
      try {
        message = JSON.parse(body.Message);
      } catch {
        this.logger.error('SES controller: SNS Message was not valid JSON.');
        return;
      }

      const status = message.notificationType
        ? mapSesNotificationType(message.notificationType)
        : null;
      const messageId = message.mail?.messageId;
      if (!status || !messageId) return;

      await this.tracking.updateByProviderMessageId(messageId, status);
    }
  }

  return SesNotificationController;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
