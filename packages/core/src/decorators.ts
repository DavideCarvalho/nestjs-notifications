import 'reflect-metadata';
import type { ModuleRef } from '@nestjs/core';
import type { ChannelRef, Notifiable, Notification } from './interfaces';

const CHANNEL_HANDLERS = Symbol('nestjs-notifications:channel-handlers');
const INJECTED_SERVICES = Symbol('nestjs-notifications:injected-services');

/** Maps a channel name to the notification method that builds its payload. */
type HandlerMap = Record<string, string | symbol>;
interface InjectedService {
  propertyKey: string | symbol;
  token: unknown;
}

/**
 * A channel handle: callable as a method decorator (`@Mail()`) and usable as a
 * type-safe value in `via()` (`return [Mail]`). Channel packages create one per channel.
 */
export interface ChannelHandle extends ChannelRef {
  (): MethodDecorator;
}

/**
 * Build a channel handle for a channel name. Each channel package exports one:
 *
 * ```ts
 * export const Mail = createChannel('mail');
 * ```
 */
export function createChannel(channel: string): ChannelHandle {
  const handle = (() => {
    const decorator: MethodDecorator = (target, propertyKey) => {
      const map: HandlerMap = {
        ...(Reflect.getOwnMetadata(CHANNEL_HANDLERS, target.constructor) as HandlerMap | undefined),
      };
      map[channel] = propertyKey;
      Reflect.defineMetadata(CHANNEL_HANDLERS, map, target.constructor);
    };
    return decorator;
  }) as ChannelHandle;
  Object.defineProperty(handle, 'channel', { value: channel, enumerable: true });
  return handle;
}

/**
 * Inject a provider into a notification property. The library resolves it from the Nest
 * container at delivery time (and again after async rehydration), so notifications stay
 * `new`-able with data while still using services:
 *
 * ```ts
 * class InvoicePaid {
 *   @InjectService(UrlService) private urls!: UrlService;
 * }
 * ```
 */
export function InjectService(token: unknown): PropertyDecorator {
  return (target, propertyKey) => {
    const list: InjectedService[] = [
      ...((Reflect.getOwnMetadata(INJECTED_SERVICES, target.constructor) as InjectedService[]) ??
        []),
    ];
    list.push({ propertyKey, token });
    Reflect.defineMetadata(INJECTED_SERVICES, list, target.constructor);
  };
}

function readHandlers(notification: Notification): HandlerMap {
  return (
    (Reflect.getMetadata(CHANNEL_HANDLERS, notification.constructor) as HandlerMap | undefined) ??
    {}
  );
}

function readInjected(notification: Notification): InjectedService[] {
  return (
    (Reflect.getMetadata(INJECTED_SERVICES, notification.constructor) as InjectedService[]) ?? []
  );
}

function toChannelName(channel: string | ChannelRef): string {
  return typeof channel === 'string' ? channel : channel.channel;
}

/**
 * Resolve the channels a notification targets. An explicit `via()` wins (and may return
 * names or {@link ChannelRef} handles); otherwise the channels are inferred from the
 * payload methods' channel decorators.
 */
export function resolveChannels(notification: Notification, notifiable: Notifiable): string[] {
  if (typeof notification.via === 'function') {
    return notification.via(notifiable).map(toChannelName);
  }
  return Object.keys(readHandlers(notification));
}

/**
 * Return the bound payload method for a channel: the decorator-mapped method if present,
 * else the `fallback` convention name (e.g. `toMail`). Undefined when neither exists.
 */
export function getHandler(
  notification: Notification,
  channel: string,
  fallback: string,
): ((...args: unknown[]) => unknown) | undefined {
  const method = readHandlers(notification)[channel] ?? fallback;
  const fn = (notification as Record<string | symbol, unknown>)[method];
  return typeof fn === 'function'
    ? (fn as (...args: unknown[]) => unknown).bind(notification)
    : undefined;
}

/**
 * Populate `@InjectService` properties from the container. Idempotent and only fills
 * properties that are still undefined, so it is safe to call before every delivery.
 */
export function injectServices(notification: Notification, moduleRef: ModuleRef): void {
  for (const { propertyKey, token } of readInjected(notification)) {
    const target = notification as Record<string | symbol, unknown>;
    if (target[propertyKey] === undefined) {
      target[propertyKey] = moduleRef.get(token as never, { strict: false });
    }
  }
}
