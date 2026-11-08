import { currentMailScope } from '@dudousxd/nestjs-notifications-mail';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  type Provider,
} from '@nestjs/common';
import { type MailEvent, MailEvents } from '@nestjs/mail';
import type { Subscription } from 'rxjs';
import type { DeliveryTrackingStore } from '../interfaces';
import { DELIVERY_TRACKING_STORE } from '../tokens';

/**
 * Records the mail `@nestjs/mail` sends outside notifications (a direct `mailer.send()`) in the
 * {@link DeliveryTrackingStore}, from its `MailEvents` (`sent` / `failed`), with the provider's
 * message id, so SES bounces and complaints correlate to them too. Mail the mail channel sends is
 * skipped here: the `notification.sent` / `notification.failed` listener already records it, with
 * the notifiable and tenant.
 */
@Injectable()
export class MailEventsDeliveryBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailEventsDeliveryBridge.name);
  private subscription?: Subscription;

  constructor(
    @Inject(DELIVERY_TRACKING_STORE)
    private readonly store: DeliveryTrackingStore,
    private readonly events: MailEvents,
  ) {}

  onModuleInit(): void {
    this.subscription = this.events.events$.subscribe((event) => {
      // Emitted inside the mailer's send, so the channel's mail scope is visible here.
      if (currentMailScope()?.notification !== undefined) return;
      void this.record(event);
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private async record(event: MailEvent): Promise<void> {
    try {
      await this.store.record({
        channel: 'mail',
        notificationType: event.mail ?? 'mail',
        notifiableType: null,
        notifiableId: null,
        tenantId: currentMailScope()?.tenant ?? null,
        providerMessageId: event.type === 'sent' ? (event.providerMessageId ?? null) : null,
        status: event.type,
        error: event.type === 'failed' ? describe(event.error) : null,
      });
    } catch (error) {
      this.logger.error(
        `MailEventsDeliveryBridge: failed to record a mail delivery: ${describe(error)}`,
      );
    }
  }
}

/**
 * Providers for the bridge. Add them to a module of the app, next to
 * `DeliveryTrackingModule.forRoot()` and `MailModule.forRoot()` (both global by default).
 */
export function mailDeliveryTracking(): Provider[] {
  return [MailEventsDeliveryBridge];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
