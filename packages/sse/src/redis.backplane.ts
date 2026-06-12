import type { SseBackplane, SseBackplaneMessage } from './backplane';

/**
 * The slice of an `ioredis`-style client this backplane uses. Pass real `ioredis` instances (or any
 * compatible client) — the package doesn't depend on `ioredis` itself, so you control the version
 * and connection. Use SEPARATE clients for publisher and subscriber: a subscriber connection enters
 * subscribe mode and can't issue regular commands.
 */
export interface RedisPubSubClient {
  publish(channel: string, message: string): unknown;
  // No callback param: `ioredis`'s `subscribe` is a variadic overload whose last argument is a
  // required callback, which a `callback?` here fails to match — forcing every caller to cast. The
  // backplane only ever calls `subscribe(channel)`, so the single-channel signature is enough and
  // lets a raw `ioredis` instance satisfy this interface with no cast.
  subscribe(channel: string): unknown;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
  quit?(): unknown;
}

export interface RedisSseBackplaneOptions {
  /** Client used to publish (regular command mode). */
  publisher: RedisPubSubClient;
  /** Client used to subscribe (enters subscribe mode). Must be a different connection. */
  subscriber: RedisPubSubClient;
  /** Pub/sub channel. Default `nestjs-notifications:sse`. */
  channel?: string;
}

const DEFAULT_CHANNEL = 'nestjs-notifications:sse';

/**
 * A Redis pub/sub {@link SseBackplane}. Every publish fans out over one Redis channel to all nodes,
 * so SSE connections on any pod receive notifications written on any other pod. Mirrors the common
 * "writer pod / API pod" split.
 *
 * ```ts
 * import Redis from 'ioredis';
 * SseChannelModule.forRoot({
 *   backplane: new RedisSseBackplane({ publisher: new Redis(url), subscriber: new Redis(url) }),
 * });
 * ```
 */
export class RedisSseBackplane implements SseBackplane {
  private readonly publisher: RedisPubSubClient;
  private readonly subscriber: RedisPubSubClient;
  private readonly channel: string;

  constructor(options: RedisSseBackplaneOptions) {
    this.publisher = options.publisher;
    this.subscriber = options.subscriber;
    this.channel = options.channel ?? DEFAULT_CHANNEL;
  }

  publish(key: string, message: SseBackplaneMessage): void {
    this.publisher.publish(this.channel, JSON.stringify({ key, message }));
  }

  subscribe(handler: (key: string, message: SseBackplaneMessage) => void): void {
    this.subscriber.subscribe(this.channel);
    this.subscriber.on('message', (channel, raw) => {
      if (channel !== this.channel) return;
      try {
        const parsed = JSON.parse(raw) as { key: string; message: SseBackplaneMessage };
        handler(parsed.key, parsed.message);
      } catch {
        // Ignore malformed payloads — never let a bad message tear down the subscription.
      }
    });
  }

  close(): void {
    this.publisher.quit?.();
    this.subscriber.quit?.();
  }
}
