import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  DeliveryRecord,
  DeliveryRecordFilter,
  DeliveryStatus,
  DeliveryTrackingStore,
  NewDeliveryRecord,
  UpdateStatusOptions,
} from './interfaces';

/** In-memory {@link DeliveryTrackingStore} for tests and prototyping. Not for production. */
@Injectable()
export class InMemoryDeliveryTrackingStore implements DeliveryTrackingStore {
  private readonly rows = new Map<string, DeliveryRecord>();

  async record(input: NewDeliveryRecord): Promise<DeliveryRecord> {
    const now = new Date();
    const row: DeliveryRecord = {
      id: randomUUID(),
      channel: input.channel,
      notificationType: input.notificationType,
      notifiableType: input.notifiableType ?? null,
      notifiableId: input.notifiableId ?? null,
      tenantId: input.tenantId ?? null,
      providerMessageId: input.providerMessageId ?? null,
      status: input.status,
      error: input.error ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async updateStatus(
    id: string,
    status: DeliveryStatus,
    opts?: UpdateStatusOptions,
  ): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    this.applyStatus(row, status, opts);
  }

  async updateStatusByProviderMessageId(
    providerMessageId: string,
    status: DeliveryStatus,
    opts?: UpdateStatusOptions,
  ): Promise<DeliveryRecord | null> {
    const row = [...this.rows.values()].find((r) => r.providerMessageId === providerMessageId);
    if (!row) return null;
    this.applyStatus(row, status, opts);
    return row;
  }

  async setProviderMessageId(id: string, providerMessageId: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.providerMessageId = providerMessageId;
    row.updatedAt = new Date();
  }

  async get(id: string): Promise<DeliveryRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async list(filter?: DeliveryRecordFilter): Promise<DeliveryRecord[]> {
    return this.all().filter(
      (r) =>
        (filter?.notifiableId === undefined || r.notifiableId === filter.notifiableId) &&
        (filter?.tenantId === undefined || r.tenantId === filter.tenantId) &&
        (filter?.channel === undefined || r.channel === filter.channel) &&
        (filter?.status === undefined || r.status === filter.status),
    );
  }

  private applyStatus(
    row: DeliveryRecord,
    status: DeliveryStatus,
    opts?: UpdateStatusOptions,
  ): void {
    row.status = status;
    if (opts?.error !== undefined) row.error = opts.error;
    row.updatedAt = new Date();
  }

  private all(): DeliveryRecord[] {
    return [...this.rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
