import { Injectable } from '@nestjs/common';
import type { PreferenceKey, PreferenceScope, PreferenceStore } from './interfaces';

/** Serialize a key to a stable string for set membership. */
function serialize(key: PreferenceKey): string {
  return JSON.stringify([key.tenant ?? null, key.notifiableType, key.notifiableId, key.channel]);
}

/**
 * In-memory {@link PreferenceStore} for tests and prototyping. Holds the set of muted
 * (tenant, notifiable, channel) tuples. Not for production — state is lost on restart.
 */
@Injectable()
export class InMemoryPreferenceStore implements PreferenceStore {
  private readonly muted = new Set<string>();

  async isMuted(key: PreferenceKey): Promise<boolean> {
    return this.muted.has(serialize(key));
  }

  async mute(key: PreferenceKey): Promise<void> {
    this.muted.add(serialize(key));
  }

  async unmute(key: PreferenceKey): Promise<void> {
    this.muted.delete(serialize(key));
  }

  async mutedChannels(scope: PreferenceScope): Promise<string[]> {
    const prefix = JSON.stringify([scope.tenant ?? null, scope.notifiableType, scope.notifiableId]);
    // Each stored entry is [tenant, type, id, channel]; reuse the 3-element prefix.
    const head = prefix.slice(0, -1); // drop the closing ']'
    const channels: string[] = [];
    for (const entry of this.muted) {
      if (entry.startsWith(`${head},`)) {
        const [, , , channel] = JSON.parse(entry) as [string | null, string, string, string];
        channels.push(channel);
      }
    }
    return channels;
  }
}
