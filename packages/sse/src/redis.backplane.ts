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
 *
 * `subscribe()` is called once, at construction of whoever owns this backplane (see
 * {@link import('./sse.hub').SseHub.onModuleInit}) — with `ioredis` that's enough for the lifetime
 * of the connection: `ioredis` auto-resubscribes its subscribed channels after a reconnect, so this
 * one-shot subscription survives connection drops. A structurally-compatible client without that
 * behavior (a hand-rolled `RedisPubSubClient`, or another library) needs its own reconnect/re-subscribe
 * handling — this class does not re-issue `subscribe()` itself.
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

/**
 * Builds a {@link RedisSseBackplane} from a client factory instead of two pre-built clients. Owns
 * the "publisher and subscriber must be separate connections" rule (documented on
 * {@link RedisPubSubClient}) so a consumer can't accidentally pass the same client twice: a client
 * that has entered subscribe mode rejects regular commands — `ioredis` fails with
 * `"Connection in subscriber mode, only subscriber commands may be used"` — which is exactly the
 * footgun this factory prevents by calling `createClient()` twice.
 *
 * The consumer stays in charge of client construction/config (BYO style) — this package adds no
 * `ioredis` dependency; `createClient` returns anything satisfying {@link RedisPubSubClient}.
 *
 * ```ts
 * import Redis from 'ioredis';
 * SseChannelModule.forRoot({
 *   backplane: redisSseBackplane(() => new Redis(url)),
 * });
 * ```
 */
export function redisSseBackplane(
  createClient: () => RedisPubSubClient,
  options?: { channel?: string },
): RedisSseBackplane {
  return new RedisSseBackplane({
    publisher: createClient(),
    subscriber: createClient(),
    ...(options?.channel !== undefined ? { channel: options.channel } : {}),
  });
}
