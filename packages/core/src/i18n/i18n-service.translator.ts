import { Injectable, type Provider } from '@nestjs/common';
import { I18nContext, I18nService } from '@nestjs/i18n';
import type { TranslateParams, Translator } from '../localization';
import { NOTIFICATION_TRANSLATOR } from '../tokens';

/**
 * Adapts `@nestjs/i18n` to the notifications {@link Translator}: `localization.t(key, params)`
 * becomes `i18n.translate(key, { locale, args: params })`, and every channel delivery runs inside
 * `I18nContext.run(locale)`, so `t()` (and anything else reading the ambient `I18nContext` during
 * the delivery) sees the recipient's locale. Mail classes rendered by `@nestjs/mail` get it a
 * different way: `MailChannel` passes `locale` to `mailer.send()` explicitly. Catalogs, plurals, fallbacks and formatting are `@nestjs/i18n`'s
 * (https://docs.nestjs.com/application/i18n); the recipient's locale still comes from the
 * notifications `LocaleResolver`.
 */
@Injectable()
export class I18nServiceTranslator implements Translator {
  constructor(
    private readonly i18n: I18nService,
    private readonly context: I18nContext,
  ) {}

  translate(key: string, locale: string, params?: TranslateParams): string {
    return this.i18n.translate(key, { locale, ...(params ? { args: params } : {}) });
  }

  runInLocale<R>(locale: string, fn: () => R): R {
    return this.context.run(locale, fn);
  }
}

/**
 * The provider binding {@link I18nServiceTranslator} as the notifications translator. Pass it in
 * `NotificationsModule.forRoot({ providers: [i18nTranslator()] })`; `I18nModule` must be global
 * (its default) or imported through `forRoot({ imports })`.
 */
export function i18nTranslator(): Provider[] {
  return [
    I18nServiceTranslator,
    { provide: NOTIFICATION_TRANSLATOR, useExisting: I18nServiceTranslator },
  ];
}
