import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  DigestCadence,
  NewPendingDigestEntry,
  PendingDigestEntry,
  PendingDigestGroup,
  PendingDigestStore,
} from './digest.interfaces';

/** Stable group key for a `(tenant, notifiable, category, cadence)`. */
function groupKey(entry: PendingDigestEntry): string {
  return JSON.stringify([
    entry.tenantId ?? null,
    entry.notifiable.type,
    String(entry.notifiable.id),
    entry.category,
    entry.cadence,
  ]);
}

/**
 * In-memory {@link PendingDigestStore} for tests and prototyping. Holds the suppressed-pending
 * entries and the set of flush windows already run (for idempotency). Not for production — state
 * is lost on restart.
 */
@Injectable()
export class InMemoryPendingDigestStore implements PendingDigestStore {
  private readonly entries = new Map<string, PendingDigestEntry>();
  private readonly lockedWindows = new Set<string>();

  async enqueue(entry: NewPendingDigestEntry): Promise<void> {
    const id = randomUUID();
    this.entries.set(id, {
      id,
      notifiable: { type: entry.notifiable.type, id: entry.notifiable.id },
      tenantId: entry.tenantId ?? null,
      category: entry.category,
      cadence: entry.cadence,
      notification: { name: entry.notification.name, data: { ...entry.notification.data } },
      createdAt: new Date(),
    });
  }

  async listGroups(cadence: DigestCadence): Promise<PendingDigestGroup[]> {
    const groups = new Map<string, PendingDigestGroup>();
    for (const entry of this.entries.values()) {
      if (entry.cadence !== cadence) continue;
      const key = groupKey(entry);
      let group = groups.get(key);
      if (!group) {
        group = {
          notifiable: { type: entry.notifiable.type, id: entry.notifiable.id },
          tenantId: entry.tenantId,
          category: entry.category,
          cadence: entry.cadence,
          entries: [],
        };
        groups.set(key, group);
      }
      group.entries.push(entry);
    }
    for (const group of groups.values()) {
      group.entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    return [...groups.values()];
  }

  async clear(ids: string[]): Promise<void> {
    for (const id of ids) this.entries.delete(id);
  }

  async tryLockWindow(cadence: DigestCadence, windowKey: string): Promise<boolean> {
    const key = `${cadence}:${windowKey}`;
    if (this.lockedWindows.has(key)) return false;
    this.lockedWindows.add(key);
    return true;
  }
}
