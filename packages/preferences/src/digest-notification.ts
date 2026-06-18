import type {
  ChannelContext,
  Notifiable,
  NotifiableRef,
  Notification,
  SerializedNotification,
} from '@dudousxd/nestjs-notifications-core';
import type { DigestCadence } from './digest.interfaces';

/**
 * One collected item inside a digest: the rebuilt notification that was suppressed, plus when it
 * was originally sent. The rebuilt instance is a live {@link Notification} (rehydrated by the core
 * serializer), so a custom digest renderer can call its payload methods (`toMail`, `toArray`, …).
 */
export interface DigestItem {
  /** The original notification, rebuilt from its stored serialized form. */
  notification: Notification;
  /** The serialized form, for renderers that prefer the raw `{ name, data }`. */
  serialized: SerializedNotification;
  /** When the original (suppressed) send happened. */
  createdAt: Date;
}

/**
 * Everything the collector knows about one batched group, handed to a {@link DigestNotificationFactory}.
 */
export interface DigestContext {
  notifiable: NotifiableRef;
  tenantId: string | null;
  category: string;
  cadence: DigestCadence;
  items: DigestItem[];
}

/**
 * The DigestNotification contract.
 *
 * A digest is just a normal {@link Notification}: the collector builds one per `(notifiable,
 * category, cadence)` group and dispatches it through the standard pipeline (instant, to the
 * channels the recipient enabled). Apps customize the SUMMARY by supplying a
 * {@link DigestNotificationFactory} in the module options — return your own notification class
 * (with `toMail`/`toDatabase`/… as usual). The factory receives the full {@link DigestContext}
 * (category, cadence, and every collected item, both rebuilt and serialized).
 *
 * When no factory is configured, the bundled {@link DefaultDigestNotification} is used: it carries
 * the items and exposes a generic `toArray()`/`toDatabase()` summary plus a stable `category`
 * (so the recipient's preferences still route it) — sensible for the database channel out of the
 * box, and overridable per app.
 */
export type DigestNotificationFactory = (context: DigestContext) => Notification;

/**
 * Default digest summary used when the app configures no {@link DigestNotificationFactory}. It is
 * categorized (so it routes through the same category preferences, as `instant`) and renders a
 * generic structural summary for the database/array channels. Apps wanting channel-specific copy
 * (a nicely formatted email, etc.) supply their own factory instead.
 */
export class DefaultDigestNotification implements Notification {
  /** Routes the digest through the same category — but the collector forces its cadence instant. */
  readonly category: string;

  constructor(private readonly context: DigestContext) {
    this.category = context.category;
  }

  /** The collected items, newest-first, as plain serialized payloads. */
  get items(): SerializedNotification[] {
    return this.context.items.map((item) => item.serialized);
  }

  /** Generic summary payload (used by the database channel and `toArray` consumers). */
  toArray(_notifiable: Notifiable): Record<string, unknown> {
    return {
      digest: true,
      category: this.context.category,
      cadence: this.context.cadence,
      count: this.context.items.length,
      items: this.context.items.map((item) => ({
        type: item.serialized.name,
        data: item.serialized.data,
        at: item.createdAt.toISOString(),
      })),
    };
  }

  /** Database channel payload — same shape as {@link toArray}. */
  toDatabase({ notifiable }: ChannelContext): Record<string, unknown> {
    return this.toArray(notifiable);
  }

  /** Async-dispatch serialization of the digest itself (Notification contract). */
  serialize(): Record<string, unknown> {
    return {
      category: this.context.category,
      cadence: this.context.cadence,
      items: this.context.items.map((item) => ({
        name: item.serialized.name,
        data: item.serialized.data,
        at: item.createdAt.toISOString(),
      })),
    };
  }

  /** Stable name for async (de)serialization of the digest itself. */
  static readonly notificationName = 'nestjs-notifications.digest';
}
