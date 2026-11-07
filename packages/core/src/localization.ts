import type { Notifiable } from './interfaces';

/**
 * Resolves the locale (BCP-47 tag, e.g. `"en"`, `"pt-BR"`) to render a notification in for a given
 * notifiable. Bind one under {@link NOTIFICATION_LOCALE_RESOLVER}; absent, the default resolver
 * reads a `locale`/`preferredLocale`/`lang` property off the notifiable, falling back to the
 * module-configured default locale.
 *
 * Mirrors Knock/Novu's per-recipient locale: the recipient's preference drives which translation
 * set + template variant is used.
 */
export interface LocaleResolver {
  /** Return the locale for `notifiable`, or `undefined` to fall back to the default locale. */
  resolve(notifiable: Notifiable): string | undefined | Promise<string | undefined>;
}

/** Default {@link LocaleResolver}: reads a locale-ish property off the notifiable. */
export class PropertyLocaleResolver implements LocaleResolver {
  resolve(notifiable: Notifiable): string | undefined {
    const obj = notifiable as Record<string, unknown>;
    for (const key of ['locale', 'preferredLocale', 'lang', 'language']) {
      const value = obj[key];
      if (typeof value === 'string' && value) return value;
    }
    return undefined;
  }
}

/** Parameters interpolated into a translated string. */
export type TranslateParams = Record<string, unknown>;

/**
 * Translates notification strings for a recipient's locale. Bind one under
 * {@link NOTIFICATION_TRANSLATOR} (or pass `localization.translator`); for catalogs, plurals and
 * formatting use `@nestjs/i18n` through `I18nServiceTranslator` from
 * `@dudousxd/nestjs-notifications-core/i18n`. Without one, `t(key)` returns the key.
 */
export interface Translator {
  /** Translate `key` into `locale`. Returns the key itself when no translation exists. */
  translate(key: string, locale: string, params?: TranslateParams): string;
  /**
   * Optional: run `fn` with `locale` as the ambient locale, so code that reads it implicitly
   * (`@nestjs/i18n`'s `t()`, a mail class rendered by `@nestjs/mail`) renders in the recipient's
   * language. The runner wraps each channel delivery in it.
   */
  runInLocale?<R>(locale: string, fn: () => R): R;
}

/** The default {@link Translator} when none is bound: every key translates to itself. */
export const keyTranslator: Translator = {
  translate: (key) => key,
};

/** The localization context threaded to a channel/notification at render time. */
export interface Localization {
  /** The resolved locale this delivery is being rendered in. */
  locale: string;
  /** Translate a key in {@link locale} (shorthand bound to the resolved translator). */
  t(key: string, params?: TranslateParams): string;
}

/** Strip a region subtag: `"pt-BR"` → `"pt"`. Returns the input when there is no region. */
export function baseLocale(locale: string): string {
  const dash = locale.indexOf('-');
  return dash === -1 ? locale : locale.slice(0, dash);
}

/** Build a {@link Localization} binding a translator to a resolved locale. */
export function makeLocalization(translator: Translator, locale: string): Localization {
  return {
    locale,
    t: (key, params) => translator.translate(key, locale, params),
  };
}
