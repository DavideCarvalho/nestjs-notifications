import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import type {
  ChannelContext,
  ChannelDriver,
  DeliveryContext,
  Notifiable,
  Notification,
} from './interfaces';
import {
  InMemoryTranslator,
  type LocaleResolver,
  PropertyLocaleResolver,
  baseLocale,
} from './localization';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';
import { NOTIFICATION_LOCALE_RESOLVER } from './tokens';

describe('InMemoryTranslator', () => {
  const t = new InMemoryTranslator(
    {
      en: { greeting: 'Hello {name}' },
      'pt-BR': { greeting: 'Olá {name}' },
      pt: { greeting: 'Olá (pt) {name}' },
    },
    'en',
  );

  it('translates into the requested locale with interpolation', () => {
    expect(t.translate('greeting', 'en', { name: 'Ada' })).toBe('Hello Ada');
    expect(t.translate('greeting', 'pt-BR', { name: 'Ada' })).toBe('Olá Ada');
  });

  it('falls back to the base locale then the default locale then the key', () => {
    // 'pt-PT' has no entry → base 'pt'.
    expect(t.translate('greeting', 'pt-PT', { name: 'X' })).toBe('Olá (pt) X');
    // unknown locale → default 'en'.
    expect(t.translate('greeting', 'fr', { name: 'X' })).toBe('Hello X');
    // unknown key → returns the key.
    expect(t.translate('missing', 'en')).toBe('missing');
  });
});

describe('baseLocale', () => {
  it('strips the region subtag', () => {
    expect(baseLocale('pt-BR')).toBe('pt');
    expect(baseLocale('en')).toBe('en');
  });
});

describe('PropertyLocaleResolver', () => {
  it('reads a locale-ish property off the notifiable', () => {
    const r = new PropertyLocaleResolver();
    expect(r.resolve({ locale: 'pt-BR' } as unknown as Notifiable)).toBe('pt-BR');
    expect(r.resolve({ lang: 'fr' } as unknown as Notifiable)).toBe('fr');
    expect(r.resolve({} as Notifiable)).toBeUndefined();
  });
});

// --- End-to-end through the runner + a channel that reads localization ---

class User implements Notifiable {
  constructor(
    public id: number,
    public locale?: string,
  ) {}
  routeNotificationFor(): unknown {
    return 'addr';
  }
  toNotifiableRef() {
    return { type: 'User', id: this.id };
  }
}

/** A channel that records the localized string it was handed. */
class CapturingChannel implements ChannelDriver {
  readonly channel = 'mail';
  readonly rendered: string[] = [];
  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const loc = context?.localization;
    const handler = (notification as { toMail: (ctx: ChannelContext) => string }).toMail;
    this.rendered.push(handler.call(notification, { notifiable, localization: loc }));
  }
}

class Welcome {
  via(): string[] {
    return ['mail'];
  }
  toMail({ notifiable: _n, localization: loc }: ChannelContext): string {
    return loc ? loc.t('welcome') : 'welcome';
  }
}

async function bootstrap(channel: ChannelDriver, resolver?: LocaleResolver) {
  const providers = resolver ? [{ provide: NOTIFICATION_LOCALE_RESOLVER, useValue: resolver }] : [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      NotificationsModule.forRoot({
        global: false,
        providers,
        localization: {
          defaultLocale: 'en',
          catalog: {
            en: { welcome: 'Welcome!' },
            'pt-BR': { welcome: 'Bem-vindo!' },
          },
        },
      }),
    ],
  }).compile();
  moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  return moduleRef;
}

describe('localization end-to-end', () => {
  it('renders the same notification differently per locale', async () => {
    const channel = new CapturingChannel();
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);

    await service.send(new User(1, 'pt-BR'), new Welcome());
    await service.send(new User(2, 'en'), new Welcome());

    expect(channel.rendered).toEqual(['Bem-vindo!', 'Welcome!']);
  });

  it('falls back to the default locale when the notifiable resolves none', async () => {
    const channel = new CapturingChannel();
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);

    await service.send(new User(3), new Welcome()); // no locale property

    expect(channel.rendered).toEqual(['Welcome!']);
  });

  it('honors a custom locale resolver', async () => {
    const resolver: LocaleResolver = { resolve: vi.fn(() => 'pt-BR') };
    const channel = new CapturingChannel();
    const moduleRef = await bootstrap(channel, resolver);
    const service = moduleRef.get(NotificationService);

    await service.send(new User(4, 'en'), new Welcome()); // resolver overrides the property

    expect(resolver.resolve).toHaveBeenCalled();
    expect(channel.rendered).toEqual(['Bem-vindo!']);
  });
});
