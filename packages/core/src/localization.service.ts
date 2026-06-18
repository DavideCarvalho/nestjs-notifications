import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Notifiable } from './interfaces';
import {
  InMemoryTranslator,
  type LocaleResolver,
  type Localization,
  PropertyLocaleResolver,
  type Translator,
  makeLocalization,
} from './localization';
import type { NotificationsModuleOptions } from './options';
import {
  NOTIFICATION_LOCALE_RESOLVER,
  NOTIFICATION_OPTIONS,
  NOTIFICATION_TRANSLATOR,
} from './tokens';

/** Fallback locale when neither the resolver nor the options specify one. */
const DEFAULT_LOCALE = 'en';

/**
 * Resolves a per-delivery {@link Localization} (locale + bound translator) for a notifiable. Uses
 * the bound {@link LocaleResolver} (default: read a locale property) and {@link Translator}
 * (default: empty {@link InMemoryTranslator}). Wired into the {@link ChannelRunner} so every
 * delivery carries a localization context the channels can use.
 */
@Injectable()
export class LocalizationService {
  private readonly resolver: LocaleResolver;
  private readonly translator: Translator;
  private readonly defaultLocale: string;

  constructor(
    @Inject(NOTIFICATION_OPTIONS)
    options: NotificationsModuleOptions,
    @Optional()
    @Inject(NOTIFICATION_LOCALE_RESOLVER)
    resolver?: LocaleResolver,
    @Optional()
    @Inject(NOTIFICATION_TRANSLATOR)
    translator?: Translator,
  ) {
    const i18n = options.localization ?? {};
    this.defaultLocale = i18n.defaultLocale ?? DEFAULT_LOCALE;
    this.resolver = resolver ?? i18n.resolver ?? new PropertyLocaleResolver();
    this.translator =
      translator ??
      i18n.translator ??
      new InMemoryTranslator(i18n.catalog ?? {}, this.defaultLocale);
  }

  /** Resolve the localization context for delivering to `notifiable`. */
  async forNotifiable(notifiable: Notifiable): Promise<Localization> {
    const resolved = (await this.resolver.resolve(notifiable)) ?? this.defaultLocale;
    return makeLocalization(this.translator, resolved);
  }
}
