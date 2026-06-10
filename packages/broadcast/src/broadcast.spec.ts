import type { Notifiable } from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it, vi } from 'vitest';
import { BroadcastChannel } from './broadcast.channel';
import type { BroadcastNotification } from './broadcast.channel';
import type { NotificationsGateway } from './gateway';

class TestUser implements Notifiable {
  constructor(public room: string) {}
  routeNotificationFor(): unknown {
    return this.room;
  }
}

class InvoicePaid implements BroadcastNotification {
  via(): string[] {
    return ['broadcast'];
  }
  toBroadcast(): Record<string, unknown> {
    return { invoice: 42, amount: 100 };
  }
}

describe('BroadcastChannel', () => {
  it('emits to the routed room with the configured event and payload', async () => {
    const emitToRoom = vi.fn();
    const gateway = { emitToRoom } as unknown as NotificationsGateway;

    const channel = new BroadcastChannel(gateway, { event: 'notification' });

    await channel.send(new TestUser('user.1'), new InvoicePaid());

    expect(emitToRoom).toHaveBeenCalledWith('user.1', 'notification', {
      invoice: 42,
      amount: 100,
    });
  });

  it('falls back to toArray then a structural copy', async () => {
    const emitToRoom = vi.fn();
    const gateway = { emitToRoom } as unknown as NotificationsGateway;
    const channel = new BroadcastChannel(gateway, {});

    class WithArray implements BroadcastNotification {
      via(): string[] {
        return ['broadcast'];
      }
      toArray(): Record<string, unknown> {
        return { kind: 'array' };
      }
    }

    await channel.send(new TestUser('room'), new WithArray());

    expect(emitToRoom).toHaveBeenCalledWith('room', 'notification', { kind: 'array' });
  });
});
