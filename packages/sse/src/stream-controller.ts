import { Controller, type MessageEvent, Req, Sse, type Type } from '@nestjs/common';
import { type Observable, from, interval, map, merge, switchMap } from 'rxjs';
import { sseKey } from './sse-key';
import { SseHub } from './sse.hub';

/** Options for {@link createNotificationsStreamController}. */
export interface NotificationsStreamControllerOptions {
  /**
   * Resolve the SSE route value from the request — must match what the notifiable returns from
   * `routeNotificationFor('sse')` (typically the user id). E.g. `(req) => req.user.id`.
   */
  resolveRoute: (req: any) => string | Promise<string>;
  /**
   * Optional tenant resolver — must match the tenant the notification was sent under, so the stream
   * key lines up with what the SSE channel published to.
   */
  resolveTenant?: (req: any) => string | undefined | Promise<string | undefined>;
  /** Controller base path. Default `'notifications'`. */
  path?: string;
  /** Sub-path for the `@Sse()` endpoint. Default `'stream'` → `GET {path}/stream`. */
  streamPath?: string;
  /**
   * Keep-alive interval (ms) emitting a `{ type: 'heartbeat' }` event so idle connections survive
   * proxy/load-balancer timeouts. Default `25000`; set `0` to disable.
   */
  heartbeatMs?: number;
}

/**
 * Builds a `@Controller` exposing the Server-Sent Events stream endpoint for in-app notifications —
 * the consumer-side counterpart the SSE channel publishes to. Mounts a native `@Sse()` route that
 * subscribes to {@link SseHub} under the same key the channel uses (`sseKey(tenant, routeValue)`),
 * so apps don't hand-write the streaming endpoint.
 *
 * ```ts
 * const NotificationsStreamController = createNotificationsStreamController({
 *   resolveRoute: (req) => String(req.user.id),
 * });
 *
 * @Module({ controllers: [NotificationsStreamController] })
 * export class InboxModule {}
 * ```
 *
 * Requires `SseChannelModule` (which provides {@link SseHub}) in scope. Pair with a cross-pod
 * `backplane` so a publish on any node reaches connections held by another.
 */
export function createNotificationsStreamController(
  options: NotificationsStreamControllerOptions,
): Type<unknown> {
  const heartbeatMs = options.heartbeatMs ?? 25_000;

  @Controller(options.path ?? 'notifications')
  class NotificationsStreamController {
    constructor(private readonly hub: SseHub) {}

    @Sse(options.streamPath ?? 'stream')
    stream(@Req() req: unknown): Observable<MessageEvent> {
      const key$ = from(
        (async () => {
          const route = await options.resolveRoute(req);
          const tenant = options.resolveTenant ? await options.resolveTenant(req) : undefined;
          return sseKey(tenant, route);
        })(),
      );
      const events$ = key$.pipe(switchMap((key) => this.hub.stream(key)));
      if (!heartbeatMs) return events$;
      const heartbeat$ = interval(heartbeatMs).pipe(
        map((): MessageEvent => ({ data: '', type: 'heartbeat' })),
      );
      return merge(events$, heartbeat$);
    }
  }

  return NotificationsStreamController;
}
