/**
 * Build the stream key the {@link SseChannel} publishes under, so a controller's
 * `@Sse()` endpoint can subscribe to the exact same key.
 *
 * Keys are tenant-aware: when `tenant` is set, the route value is prefixed with
 * `${tenant}:` so a user's stream is isolated per tenant.
 *
 * ```ts
 * const key = sseKey(req.tenantId, String(req.user.id));
 * return hub.stream(key);
 * ```
 */
export function sseKey(tenant: string | undefined, routeValue: string): string {
  return tenant ? `${tenant}:${routeValue}` : routeValue;
}
