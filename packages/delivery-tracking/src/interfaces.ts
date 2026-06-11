/**
 * Lifecycle status of a single per-channel delivery.
 *
 * - `queued` — accepted for delivery, not yet handed to the transport.
 * - `sent` — the channel transport accepted it (no terminal confirmation yet).
 * - `failed` — the channel transport threw while sending.
 * - `delivered` — the provider confirmed delivery (via an inbound status webhook).
 * - `bounced` — the provider reported a bounce/complaint/undeliverable (via webhook).
 */
export type DeliveryStatus = 'queued' | 'sent' | 'failed' | 'delivered' | 'bounced';

/** A persisted per-channel delivery record, tracked across its lifecycle. */
export interface DeliveryRecord {
  id: string;
  /** Channel name (e.g. "sms", "mail"). */
  channel: string;
  /** Notification class name (e.g. "InvoicePaid"). */
  notificationType: string;
  /** Notifiable reference type (e.g. "User"), or null when not derivable. */
  notifiableType: string | null;
  /** Notifiable reference id, or null when not derivable. */
  notifiableId: string | null;
  /** Tenant scope, or null for single-tenant. */
  tenantId: string | null;
  /**
   * The provider's message id once known (e.g. Twilio MessageSid, SES mail.messageId). Used to
   * correlate inbound provider status webhooks back to this record. Null until set by the
   * channel via {@link DeliveryTrackingStore.setProviderMessageId}.
   */
  providerMessageId: string | null;
  status: DeliveryStatus;
  /** Failure/bounce reason, or null. */
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Data needed to create a {@link DeliveryRecord} (id/timestamps assigned by the store). */
export interface NewDeliveryRecord {
  channel: string;
  notificationType: string;
  status: DeliveryStatus;
  notifiableType?: string | null;
  notifiableId?: string | null;
  tenantId?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
}

/** Options for a status transition. */
export interface UpdateStatusOptions {
  /** Failure/bounce reason to record alongside the new status. */
  error?: string;
}

/**
 * Persistence abstraction for delivery tracking. Implemented by the in-memory store and by
 * ORM adapter packages.
 */
export interface DeliveryTrackingStore {
  /** Create a new delivery record. */
  record(input: NewDeliveryRecord): Promise<DeliveryRecord>;
  /** Transition a record (by id) to a new status. */
  updateStatus(id: string, status: DeliveryStatus, opts?: UpdateStatusOptions): Promise<void>;
  /**
   * Transition the record matching a provider message id. Returns the updated record, or null
   * when no record matches (e.g. a webhook arrived for an unknown/untracked message).
   */
  updateStatusByProviderMessageId(
    providerMessageId: string,
    status: DeliveryStatus,
    opts?: UpdateStatusOptions,
  ): Promise<DeliveryRecord | null>;
  /** Attach the provider's message id to a record so later webhooks can correlate to it. */
  setProviderMessageId(id: string, providerMessageId: string): Promise<void>;
  /** Fetch a record by id, or null. */
  get(id: string): Promise<DeliveryRecord | null>;
  /** List records, optionally filtered. */
  list(filter?: DeliveryRecordFilter): Promise<DeliveryRecord[]>;
}

/** Filter for {@link DeliveryTrackingStore.list}. Omitted fields match all. */
export interface DeliveryRecordFilter {
  notifiableId?: string;
  tenantId?: string;
  channel?: string;
  status?: DeliveryStatus;
}
