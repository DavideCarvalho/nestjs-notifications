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

/** Records an in-memory store keeps before dropping the oldest. */
const MAX_ROWS = 10_000;

/**
 * In-memory {@link DeliveryTrackingStore} for tests and prototyping. Not for production: it keeps
 * only the most recent {@link MAX_ROWS} records, dropping the oldest first.
 */
@Injectable()
export class InMemoryDeliveryTrackingStore implements DeliveryTrackingStore {
  private readonly rows = new Map<string, DeliveryRecord>();
  /** Insertion sequence per record id, so a provider-id lookup can pick the oldest match. */
  private readonly seq = new Map<string, number>();
  private nextSeq = 0;
  /** Record ids by provider message id, so status webhooks don't scan every record. */
  private readonly byProviderId = new Map<string, Set<string>>();

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
    this.seq.set(row.id, this.nextSeq++);
    if (row.providerMessageId !== null) this.index(row.providerMessageId, row.id);
    if (this.rows.size > MAX_ROWS) this.evictOldest();
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
    const row = this.findByProviderId(providerMessageId);
    if (!row) return null;
    this.applyStatus(row, status, opts);
    return row;
  }

  async setProviderMessageId(id: string, providerMessageId: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    if (row.providerMessageId !== null) this.unindex(row.providerMessageId, id);
    row.providerMessageId = providerMessageId;
    this.index(providerMessageId, id);
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

  /** The oldest record carrying `providerMessageId`, if any. */
  private findByProviderId(providerMessageId: string): DeliveryRecord | undefined {
    const ids = this.byProviderId.get(providerMessageId);
    if (!ids) return undefined;
    let oldest: string | undefined;
    for (const id of ids) {
      if (oldest === undefined || (this.seq.get(id) ?? 0) < (this.seq.get(oldest) ?? 0)) {
        oldest = id;
      }
    }
    return oldest === undefined ? undefined : this.rows.get(oldest);
  }

  private index(providerMessageId: string, id: string): void {
    let ids = this.byProviderId.get(providerMessageId);
    if (!ids) {
      ids = new Set();
      this.byProviderId.set(providerMessageId, ids);
    }
    ids.add(id);
  }

  private unindex(providerMessageId: string, id: string): void {
    const ids = this.byProviderId.get(providerMessageId);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) this.byProviderId.delete(providerMessageId);
  }

  private evictOldest(): void {
    const oldest = this.rows.keys().next();
    if (oldest.done) return;
    const row = this.rows.get(oldest.value);
    this.rows.delete(oldest.value);
    this.seq.delete(oldest.value);
    if (row?.providerMessageId != null) this.unindex(row.providerMessageId, oldest.value);
  }

  private all(): DeliveryRecord[] {
    return [...this.rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
