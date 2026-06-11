import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { DeliveryTrackingListener } from './delivery-tracking.listener';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { InMemoryDeliveryTrackingStore } from './in-memory.store';
import type { DeliveryTrackingStore } from './interfaces';
import { DELIVERY_TRACKING_STORE } from './tokens';

export interface DeliveryTrackingModuleOptions {
  /** A store class to instantiate, or omit to use the in-memory store. */
  store?: Type<DeliveryTrackingStore>;
  /** Register globally so the service/store are discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers delivery tracking: a listener that persists per-channel delivery status from the core
 * `notification.sent` / `notification.failed` events, plus a query/update service.
 *
 * Requires `EventEmitterModule.forRoot()` in the host app (as the core events flow through
 * `@nestjs/event-emitter`). Mount the inbound webhook controllers
 * ({@link import('./inbound/twilio.controller').createTwilioStatusController},
 * {@link import('./inbound/ses.controller').createSesNotificationController}) in your own module's
 * `controllers` to feed provider status callbacks back into the store.
 *
 * ```ts
 * @Module({
 *   imports: [EventEmitterModule.forRoot(), DeliveryTrackingModule.forRoot()],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class DeliveryTrackingModule {
  static forRoot(options: DeliveryTrackingModuleOptions = {}): DynamicModule {
    const storeClass = options.store ?? InMemoryDeliveryTrackingStore;
    const providers: Provider[] = [
      storeClass,
      { provide: DELIVERY_TRACKING_STORE, useExisting: storeClass },
      DeliveryTrackingService,
      DeliveryTrackingListener,
    ];

    return {
      module: DeliveryTrackingModule,
      global: options.global ?? true,
      providers,
      exports: [DeliveryTrackingService, DELIVERY_TRACKING_STORE],
    };
  }
}
