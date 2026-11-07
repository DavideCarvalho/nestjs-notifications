import {
  BaseChannel,
  type ChannelContext,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  notificationName,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, type Type } from '@nestjs/common';
import {
  type MailAddressInput,
  type MailAttachmentInput,
  type MailRetryOptions,
  type MailSendResult,
  type Mailable,
  Mailer,
} from '@nestjs/mail';
import { type MailAttachment, MailMessage } from './mail-message';
import { runInMailScope } from './mail-scope';
import type { MailRenderer } from './renderer';
import { MAIL_OPTIONS, MAIL_RENDERER } from './tokens';

/** Channel handle: use as `@Mail()` on a payload method, or as a token in `via()`. */
export const Mail = createChannel('mail');

/** Resolved runtime options for the mail channel. */
export interface MailChannelOptions {
  /**
   * `@nestjs/mail`'s retry for the channel's sends. Default: the `MailModule`'s. Pass `false`
   * when an outer queue already retries failed deliveries (BullMQ, or the outbox with
   * `errorPolicy: 'failFast'`), so attempts don't multiply.
   */
  retry?: number | false | MailRetryOptions | undefined;
}

/**
 * A `@nestjs/mail` mail class to render for this notification, with its data. Returned from
 * `toMail(ctx)` instead of a {@link MailMessage}; sent as
 * `mailer.send(mail, { to, data, locale })` with the recipient's locale.
 */
export interface MailableMail<D = unknown> {
  mail: Type<Mailable<D>>;
  data?: D;
  from?: MailAddressInput;
  replyTo?: MailAddressInput | MailAddressInput[];
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
}

/** Implement this on a notification to define its email payload. */
export interface MailNotification extends Notification {
  /**
   * Build the email: a fluent {@link MailMessage} the channel renders, or a `@nestjs/mail` mail
   * class with its data (`{ mail: OrderShippedMail, data: order }`). The `ctx` carries the
   * recipient and the resolved localization.
   */
  toMail(ctx: ChannelContext): MailMessage | MailableMail;
}

/**
 * Builds a notification's email and sends it with `@nestjs/mail`'s `Mailer` (configured with
 * `MailModule.forRoot()`: transport, default `from`, retries, events). The recipient comes from
 * `routeNotificationFor('mail')`. Returns the `MailSendResult`, so delivery tracking records the
 * provider's message id.
 */
@Injectable()
export class MailChannel extends BaseChannel {
  readonly channel = 'mail';

  constructor(
    private readonly mailer: Mailer,
    @Inject(MAIL_RENDERER)
    private readonly renderer: MailRenderer,
    @Inject(MAIL_OPTIONS)
    private readonly options: MailChannelOptions = {},
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<MailSendResult> {
    const to = recipientOf(routeFor(notifiable, 'mail', notification));
    const payload = this.buildPayload<MailMessage | MailableMail>(
      notification,
      notifiable,
      'toMail',
      context,
    );
    const delivery = {
      ...(context?.idempotencyKey !== undefined ? { idempotencyKey: context.idempotencyKey } : {}),
      ...(this.options.retry !== undefined ? { retry: this.options.retry } : {}),
    };
    const scope = { tenant: context?.tenant, notification: notificationName(notification) };

    if (payload instanceof MailMessage) {
      const rendered = await this.renderer.render(payload);
      const attachments = await resolveAttachments(payload.attachments);
      return runInMailScope(scope, () =>
        this.mailer.send({
          to,
          subject: payload.subjectLine,
          html: rendered.html,
          text: rendered.text,
          ...(payload.fromAddress !== undefined ? { from: payload.fromAddress } : {}),
          ...(payload.replyToAddress !== undefined ? { replyTo: payload.replyToAddress } : {}),
          ...(Object.keys(payload.headerValues).length ? { headers: payload.headerValues } : {}),
          ...(attachments.length ? { attachments } : {}),
          ...(context?.localization ? { locale: context.localization.locale } : {}),
          ...delivery,
        }),
      );
    }

    if (isMailableMail(payload)) {
      const attachments = await resolveAttachments(payload.attachments ?? []);
      return runInMailScope(scope, () =>
        this.mailer.send(payload.mail, {
          to,
          data: payload.data,
          ...(context?.localization ? { locale: context.localization.locale } : {}),
          ...(payload.from !== undefined ? { from: payload.from } : {}),
          ...(payload.replyTo !== undefined ? { replyTo: payload.replyTo } : {}),
          ...(payload.headers !== undefined ? { headers: payload.headers } : {}),
          ...(attachments.length ? { attachments } : {}),
          ...delivery,
        } as Parameters<Mailer['send']>[1] & object),
      );
    }

    throw new TypeError(
      `${notificationName(notification)}.toMail() must return a MailMessage or { mail: MailClass, data }`,
    );
  }
}

function isMailableMail(value: unknown): value is MailableMail {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as MailableMail).mail === 'function'
  );
}

/** The mail route as `@nestjs/mail` takes it: an address, `{ name, address }`, or a list of them. */
function recipientOf(route: unknown): MailAddressInput | MailAddressInput[] {
  if (typeof route === 'string') return route;
  if (Array.isArray(route)) return route as MailAddressInput[];
  if (
    route &&
    typeof route === 'object' &&
    typeof (route as { address?: unknown }).address === 'string'
  ) {
    return route as MailAddressInput;
  }
  throw new Error(
    'The mail channel needs a recipient: return an address from routeNotificationFor("mail") or @RouteFor("mail").',
  );
}

/** `@nestjs/mail` reads `path` from disk only: download the `url` attachments here. */
async function resolveAttachments(attachments: MailAttachment[]): Promise<MailAttachmentInput[]> {
  return Promise.all(
    attachments.map(async ({ url, ...rest }) => {
      if (url === undefined) return rest;
      if (!/^https?:\/\//i.test(url)) {
        throw new Error(`Mail attachment url must be http(s): ${url}`);
      }
      const response = await fetch(url, { redirect: 'error' });
      if (!response.ok) {
        throw new Error(
          `Downloading the mail attachment ${url} failed with status ${response.status}.`,
        );
      }
      const content = Buffer.from(await response.arrayBuffer());
      const contentType = rest.contentType ?? response.headers.get('content-type') ?? undefined;
      return { ...rest, content, ...(contentType ? { contentType } : {}) };
    }),
  );
}
