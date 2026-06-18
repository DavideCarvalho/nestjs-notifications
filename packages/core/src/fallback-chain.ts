import type { ChannelResult, Notifiable, Notification } from './interfaces';

/**
 * Cross-channel fallback / escalation policy, read off a notification instance (duck-typed, fully
 * opt-in). Modelled after Knock's channel-step escalation and Novu's multi-step workflows: try an
 * ordered chain of channels, escalating to the next only when the current one does not reach the
 * recipient.
 *
 * A notification that declares no `fallback()` is delivered normally (every `via()` channel in
 * parallel) — behavior is unchanged.
 */
export interface FallbackAware {
  /**
   * Return an ordered {@link FallbackPolicy} to deliver this notification as an escalation chain,
   * or `undefined` to deliver normally. The chain REPLACES the parallel `via()` fan-out for this
   * send.
   */
  fallback?(notifiable: Notifiable): FallbackPolicy | undefined;
}

/** An ordered escalation chain: try each channel in turn until one is confirmed delivered. */
export interface FallbackPolicy {
  /** Ordered channels, e.g. `['push', 'sms', 'mail']`. The first is preferred. */
  channels: string[];
  /**
   * How long to wait for delivery confirmation before escalating to the next channel, in ms. Only
   * consulted when a {@link DeliveryConfirmation} probe is provided; with the default probe a
   * non-`sent` immediate result escalates right away. Default `0` (no wait — immediate result
   * decides).
   */
  timeoutMs?: number;
}

/** Read the fallback hook off a notification instance. */
export function readFallback(notification: Notification): FallbackAware {
  return notification as FallbackAware;
}

/**
 * Optional probe consulted to decide whether a channel reached the recipient, using the
 * delivery-tracking signal. Returns `true` when the channel is confirmed delivered (stop the
 * chain), `false` when it is not (escalate). Bound under {@link DELIVERY_CONFIRMATION} — absent,
 * the chain uses only the immediate per-channel {@link ChannelResult}.
 */
export interface DeliveryConfirmation {
  /**
   * Did `channel` reach `notifiable` for this `notification` within `timeoutMs`? `result` is the
   * immediate per-channel send outcome.
   */
  confirm(input: {
    notifiable: Notifiable;
    notification: Notification;
    channel: string;
    tenant?: string | undefined;
    timeoutMs: number;
    result: ChannelResult;
  }): boolean | Promise<boolean>;
}

/** Outcome of running an escalation chain. */
export interface FallbackChainResult {
  /** Per-channel results for every channel actually attempted, in order. */
  results: ChannelResult[];
  /** The channel that succeeded and stopped the chain, or `undefined` if all failed. */
  deliveredVia?: string;
}

/**
 * Run an ordered escalation chain: attempt each channel via `deliver`; after each attempt decide
 * whether it reached the recipient (`isDelivered`). Stop at the first delivered channel; otherwise
 * escalate. Returns every attempt's result plus the channel that succeeded.
 *
 * Pure and transport-agnostic — the caller supplies `deliver` (wired to the ChannelRunner) and
 * `isDelivered` (wired to the immediate result and/or a {@link DeliveryConfirmation} probe).
 */
export async function runFallbackChain(
  channels: string[],
  deliver: (channel: string) => Promise<ChannelResult>,
  isDelivered: (result: ChannelResult, channel: string) => boolean | Promise<boolean>,
): Promise<FallbackChainResult> {
  const results: ChannelResult[] = [];
  for (const channel of channels) {
    const result = await deliver(channel);
    results.push(result);
    if (await isDelivered(result, channel)) {
      return { results, deliveredVia: channel };
    }
  }
  return { results };
}

/**
 * Default delivery decision when no {@link DeliveryConfirmation} probe is bound: a channel counts
 * as delivered when its immediate result is `sent`. Anything else (`failed`, `skipped`,
 * `deferred`, ...) escalates to the next channel.
 */
export function deliveredFromResult(result: ChannelResult): boolean {
  return result.status === 'sent';
}
