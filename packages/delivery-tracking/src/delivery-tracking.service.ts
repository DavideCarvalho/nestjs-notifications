import { Inject, Injectable } from '@nestjs/common';
import type {
  DeliveryRecord,
  DeliveryRecordFilter,
  DeliveryStatus,
  DeliveryTrackingStore,
  UpdateStatusOptions,
} from './interfaces';
import { DELIVERY_TRACKING_STORE } from './tokens';

/**
 * Thin query/update facade over the {@link DeliveryTrackingStore}. Inject it to read tracking
 * records and to apply terminal status transitions from provider status webhooks.
 */
@Injectable()
export class DeliveryTrackingService {
  constructor(
    @Inject(DELIVERY_TRACKING_STORE)
    private readonly store: DeliveryTrackingStore,
  ) {}

  /** List tracking records, optionally filtered. */
  list(filter?: DeliveryRecordFilter): Promise<DeliveryRecord[]> {
    return this.store.list(filter);
  }

  /** Fetch a single record by id, or null. */
  get(id: string): Promise<DeliveryRecord | null> {
    return this.store.get(id);
  }

  /** Mark a record (by id) as delivered. */
  markDelivered(id: string): Promise<void> {
    return this.store.updateStatus(id, 'delivered');
  }

  /** Mark a record (by id) as bounced, with an optional reason. */
  markBounced(id: string, error?: string): Promise<void> {
    return this.store.updateStatus(id, 'bounced', error ? { error } : undefined);
  }

  /**
   * Correlate an inbound provider status callback to its record via the provider message id and
   * apply the new status. Returns the updated record, or null when no record matches.
   */
  updateByProviderMessageId(
    providerMessageId: string,
    status: DeliveryStatus,
    opts?: UpdateStatusOptions,
  ): Promise<DeliveryRecord | null> {
    return this.store.updateStatusByProviderMessageId(providerMessageId, status, opts);
  }
}
