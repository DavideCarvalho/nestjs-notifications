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

/** Parameters interpolated into a translated string (`{name}` style placeholders). */
export type TranslateParams = Record<string, string | number>;

/**
 * Minimal translator. Resolves a message `key` for a `locale`, interpolating `params`. Deliberately
 * tiny so nothing external is required; bind a richer one (i18next, etc.) under
 * {@link NOTIFICATION_TRANSLATOR} if you need plurals/namespaces.
 */
export interface Translator {
  /** Translate `key` into `locale`. Returns the key itself when no translation exists. */
  translate(key: string, locale: string, params?: TranslateParams): string;
}

/** A flat `{ locale: { key: template } }` catalog for the {@link InMemoryTranslator}. */
export type TranslationCatalog = Record<string, Record<string, string>>;

/**
 * In-memory {@link Translator} — the zero-dependency default. Looks up `catalog[locale][key]`,
 * falling back to `catalog[defaultLocale][key]`, then to the raw key. Interpolates `{placeholder}`
 * tokens from `params`.
 */
export class InMemoryTranslator implements Translator {
  constructor(
    private readonly catalog: TranslationCatalog = {},
    private readonly defaultLocale = 'en',
  ) {}

  translate(key: string, locale: string, params?: TranslateParams): string {
    const template =
      this.lookup(locale, key) ??
      this.lookup(baseLocale(locale), key) ??
      this.lookup(this.defaultLocale, key) ??
      key;
    return interpolate(template, params);
  }

  private lookup(locale: string, key: string): string | undefined {
    return this.catalog[locale]?.[key];
  }
}

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

/** Replace `{name}` placeholders with `params.name`. Leaves unknown placeholders untouched. */
function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

/** Build a {@link Localization} binding a translator to a resolved locale. */
export function makeLocalization(translator: Translator, locale: string): Localization {
  return {
    locale,
    t: (key, params) => translator.translate(key, locale, params),
  };
}
