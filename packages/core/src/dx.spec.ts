import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import { NotifiableId, RouteFor, createChannel, getHandler } from './decorators';
import {
  type ChannelDriver,
  Notifiable,
  type Notifiable as NotifiableType,
  type Notification,
} from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';

const Mail = createChannel('mail');
const Sms = createChannel('sms');

// Decorator-only notifiable — no routeNotificationFor switch, no toNotifiableRef.
@Notifiable()
class User {
  @NotifiableId() id: number;
  @RouteFor('mail') email: string;
  @RouteFor('sms') phone: string;
  constructor(id: number, email: string, phone: string) {
    this.id = id;
    this.email = email;
    this.phone = phone;
  }
}

class Alert {
  paid = true;
  via() {
    return [Mail, Sms];
  }
  @Mail() toMail() {
    return { subject: 'a' };
  }
  @Sms() toSms() {
    return 'sms body';
  }
  // Only send SMS when not paid.
  shouldSend(_n: NotifiableType, channel: string) {
    return channel === 'sms' ? !this.paid : true;
  }
  afterSent: Array<{ channel: string; response: unknown }> = [];
  afterSending(_n: NotifiableType, channel: string, response: unknown) {
    this.afterSent.push({ channel, response });
  }
}

class CaptureChannel implements ChannelDriver {
  readonly addresses: unknown[] = [];
  constructor(readonly channel: string) {}
  async send(notifiable: NotifiableType, notification: Notification): Promise<unknown> {
    const handler = getHandler(notification, this.channel, `to${this.channel}`);
    this.addresses.push(notifiable);
    return { delivered: this.channel, payload: handler?.() };
  }
}

async function boot(channels: CaptureChannel[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot(), NotificationsModule.forRoot({ global: false })],
  }).compile();
  const registry = moduleRef.get(ChannelRegistry);
  for (const c of channels) registry.register(c);
  await moduleRef.init();
  return moduleRef;
}

describe('DX: decorator notifiable + shouldSend/afterSending/SendResult', () => {
  it('routes via @RouteFor and returns a per-channel SendResult', async () => {
    const mail = new CaptureChannel('mail');
    const sms = new CaptureChannel('sms');
    const moduleRef = await boot([mail, sms]);
    const alert = new Alert(); // paid=true -> sms skipped

    const [result] = await moduleRef
      .get(NotificationService)
      .send(new User(1, 'a@b.com', '+55'), alert);

    expect(result?.results).toEqual([
      expect.objectContaining({ channel: 'mail', status: 'sent' }),
      expect.objectContaining({ channel: 'sms', status: 'skipped' }),
    ]);
    // mail delivered, sms skipped by shouldSend
    expect(mail.addresses).toHaveLength(1);
    expect(sms.addresses).toHaveLength(0);
    // afterSending fired for the delivered channel with the transport response
    expect(alert.afterSent).toEqual([
      { channel: 'mail', response: { delivered: 'mail', payload: { subject: 'a' } } },
    ]);
  });

  it('delivers the gated channel once the predicate passes', async () => {
    const mail = new CaptureChannel('mail');
    const sms = new CaptureChannel('sms');
    const moduleRef = await boot([mail, sms]);
    const alert = new Alert();
    alert.paid = false; // now sms is allowed

    const [result] = await moduleRef
      .get(NotificationService)
      .send(new User(2, 'c@d.com', '+1'), alert);

    expect(result?.results.map((r) => r.status)).toEqual(['sent', 'sent']);
    expect(sms.addresses).toHaveLength(1);
  });

  it('resolves a different address per channel from @RouteFor', async () => {
    const sms = new CaptureChannel('sms');
    const moduleRef = await boot([sms]);
    class SmsOnly {
      via() {
        return [Sms];
      }
      @Sms() toSms() {
        return 'hi';
      }
    }
    await moduleRef.get(NotificationService).send(new User(3, 'e@f.com', '+99'), new SmsOnly());
    expect((sms.addresses[0] as User).phone).toBe('+99');
  });
});
