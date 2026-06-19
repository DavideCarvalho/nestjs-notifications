/**
 * Shared HTTP helpers for webhook-style channels (slack, discord, teams, telegram, webhook).
 * Keeps the `fetch` + JSON + non-ok-throws shape in one place instead of copy-pasted per channel.
 */

/** True when `value` is an `https://` URL string. */
export function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\//i.test(value);
}

/** Options for {@link postJson}. `label` names the channel in the failure message. */
export interface PostJsonOptions {
  /** Channel label for the error, e.g. `"Slack"` → `"Slack request to … failed with status 500."`. */
  label: string;
  /** Extra request headers, merged over the default `Content-Type: application/json`. */
  headers?: Record<string, string>;
  /** HTTP method. Defaults to `POST`. */
  method?: string;
}

/**
 * POST (or `opts.method`) a JSON body, throwing a uniform error on a non-2xx response. The body is
 * serialized once here, so callers that sign the payload must sign `JSON.stringify(body)` of the
 * same object (deterministic for a given object, so the bytes match).
 */
export async function postJson(
  url: string,
  body: unknown,
  opts: PostJsonOptions,
): Promise<Response> {
  const response = await fetch(url, {
    method: opts.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${opts.label} request to ${url} failed with status ${response.status}.`);
  }
  return response;
}

/**
 * Resolve a webhook URL from the route (when it is an `https://` URL) or a configured `fallback`,
 * throwing a uniform "needs a webhook URL" error naming `channel` when neither is present.
 */
export function resolveWebhookUrl(
  route: unknown,
  fallback: string | undefined,
  channel: string,
): string {
  const url = isHttpsUrl(route) ? route : fallback;
  if (!url) {
    throw new Error(
      `The ${channel} channel needs a webhook URL. Return one from ` +
        `routeNotificationFor("${channel}"), or set webhookUrl in forRoot().`,
    );
  }
  return url;
}
