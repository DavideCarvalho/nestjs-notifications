/**
 * Compile-time guard for the ChannelRegistry augmentation in ./channel-registry. The augmentation
 * has no runtime effect, so it cannot be guarded by a runtime (vitest) test — only by the type
 * checker. This file is type-checked by `pnpm typecheck` (tsc includes src/**, excludes *.spec.ts)
 * and is never shipped (tsup bundles only index.ts, which does not import this file). If the
 * augmentation stops mapping ('notifications', <event>) to its event class, these lines fail to
 * compile.
 */
import type { NotificationSentEvent } from '@dudousxd/nestjs-notifications-core';
import { emit } from '@dudousxd/nestjs-diagnostics';
import './channel-registry';

declare const sentEvent: NotificationSentEvent;

// Positive: the augmentation makes NotificationSentEvent the accepted payload for the sent channel.
export function _acceptsSentEvent(): void {
  emit('notifications', 'sent', sentEvent);
}

// Negative: a non-event payload is rejected ONLY because the augmentation narrowed it. Without the
// augmentation, emit('notifications', ...) accepts `unknown`, the number below would be accepted, and
// this directive would become an unused-directive compile error — proving the augmentation is live.
export function _rejectsWrongPayload(): void {
  // @ts-expect-error - payload must be a NotificationSentEvent, not a number
  emit('notifications', 'sent', 123);
}
