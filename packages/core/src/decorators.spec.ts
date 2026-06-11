import { Inject, Injectable } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import { createChannel, getHandler } from './decorators';
import type { ChannelDriver, Notifiable, Notification } from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';

// Channel handles, as a channel package would export them.
const Mail = createChannel('mail');
const Database = createChannel('database');

@Injectable()
class UrlService {
  to(path: string): string {
    return `https://app.test${path}`;
  }
}

class User implements Notifiable {
  constructor(public id: number) {}
  routeNotificationFor() {
    return `user-${this.id}`;
  }
}

// (A) channels inferred from decorators, (C) service injected via NestJS's own @Inject.
class InvoicePaid {
  @Inject(UrlService) private urls!: UrlService;

  constructor(public invoiceId: string) {}

  @Mail()
  toMail() {
    return { subject: 'Paid', url: this.urls.to(`/invoices/${this.invoiceId}`) };
  }

  @Database()
  toDatabase() {
    return { invoiceId: this.invoiceId };
  }
}

// (B) explicit via() returning type-safe channel tokens.
class TokenRouted implements Notification {
  via() {
    return [Mail];
  }
  toMail() {
    return { subject: 'token' };
  }
}

class CaptureChannel implements ChannelDriver {
  readonly captured: unknown[] = [];
  constructor(readonly channel: string) {}
  async send(_notifiable: Notifiable, notification: Notification): Promise<void> {
    const handler = getHandler(notification, this.channel, `to${cap(this.channel)}`);
    this.captured.push(handler?.());
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function boot(channels: CaptureChannel[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot(), NotificationsModule.forRoot({ global: false })],
    providers: [UrlService],
  }).compile();
  const registry = moduleRef.get(ChannelRegistry);
  for (const c of channels) registry.register(c);
  await moduleRef.init();
  return moduleRef;
}

describe('decorator API', () => {
  it('(A) infers channels from method decorators and (C) injects services', async () => {
    const mail = new CaptureChannel('mail');
    const db = new CaptureChannel('database');
    const moduleRef = await boot([mail, db]);

    await moduleRef.get(NotificationService).send(new User(1), new InvoicePaid('INV-1'));

    expect(mail.captured).toEqual([{ subject: 'Paid', url: 'https://app.test/invoices/INV-1' }]);
    expect(db.captured).toEqual([{ invoiceId: 'INV-1' }]);
  });

  it('(B) routes via type-safe channel tokens returned from via()', async () => {
    const mail = new CaptureChannel('mail');
    const moduleRef = await boot([mail]);

    await moduleRef.get(NotificationService).send(new User(2), new TokenRouted());

    expect(mail.captured).toEqual([{ subject: 'token' }]);
  });
});
