# Thermo-Nuclear Review: nestjs-notifications

A genuinely well-architected library: the core (`createChannel`/`getHandler`/`routeFor`/`resolveChannels`) is a clean, reusable canonical layer, no file exceeds 600 LOC, and the `ChannelRunner`/`NotificationService` split is sound. The single biggest structural weakness is the **channel adapter layer**: every `*.channel.ts` re-implements the same delivery orchestration preamble by hand, and the five webhook-style channels each carry a verbatim copy of an HTTP `post()` helper and an `isHttpsUrl()` predicate. There is a missing base abstraction (`ChannelDriver` is a bare interface, not a base class), so ~8 adapters copy-paste the boring parts instead of inheriting them.

## Top findings

### Structural

**No base channel abstraction — every adapter hand-rolls the same `send()` preamble** — `packages/*/src/*.channel.ts` — **HIGH**
All 8 channel drivers (`mail`, `sms`, `push`, `slack`, `discord`, `telegram`, `teams`, `webhook`) repeat the identical opening of `send()`: optionally swap to a per-tenant transport/options (`context?.tenant && this.resolveX ? this.resolveX(...) : this.x`), call `getHandler(notification, '<chan>', 'to<Chan>')`, and on miss build the *exact same* error:
```ts
const name =
  (notification.constructor as { notificationName?: string }).notificationName ??
  notification.constructor.name;
throw new MissingChannelMethodError('<chan>', 'to<Chan>()', name);
```
then invoke `handler({ notifiable, localization: context?.localization, tenant: context?.tenant })`. That `MissingChannelMethodError` block appears in 8 files (`grep` confirms 8), the handler-context object in 11 sites, and the `notificationName ??` fallback in 9. **Remedy:** add an abstract `BaseChannel<TMessage>` in core that owns this preamble — `protected resolveMessage(notification, notifiable, context): TMessage` (does getHandler + missing-method-error + builds the `ChannelContext`) and a `protected resolveOptions(context)` tenant-swap helper. Adapters then implement only `deliver(message, route, options, context)`. This deletes ~15 lines from every adapter and makes the missing-method error path impossible to drift.

**Verbatim `post()` + `isHttpsUrl()` copied across the webhook-family channels** — `slack/src/slack.channel.ts:115`, `discord/src/discord.channel.ts:80`, `telegram/src/telegram.channel.ts:84`, `teams/src/teams.channel.ts:84`, `webhook/src/webhook.channel.ts:106` — **HIGH**
Five channels carry a near-identical private `post(url, body)`: `fetch` with `Content-Type: application/json`, then `if (!response.ok) throw new Error(\`<Chan> request to ${url} failed with status ${response.status}.\`)`. Three of them (`slack`, `discord`, `teams`) additionally duplicate `function isHttpsUrl(value): value is string { return typeof value === 'string' && /^https:\/\//i.test(value); }` byte-for-byte, plus an identical "needs a webhook URL" routing block (`isHttpsUrl(route) ? route : options.webhookUrl` → throw). **Remedy:** extract a shared `postJson(url, body, { headers })` helper and an `isHttpsUrl` predicate into core (or a tiny internal `@.../channel-http` util). For slack/discord/teams, a thin `WebhookChannel` base (resolve URL from route-or-default, throw uniform error, POST) collapses three files to a `toPayload()` + channel-name each.

### Code-judo

**Near-identical `forRoot()` boilerplate across 21 channel modules** — `packages/*/src/*.module.ts` — **MEDIUM**
`discord.module.ts` and `teams.module.ts` are character-for-character identical except for the names; the webhook-family modules all do the same `exactOptionalPropertyTypes` spread dance (`...(options.x !== undefined ? { x: options.x } : {})`), build `providers`, and `return { module, global: options.global ?? true, providers, exports }`. **Remedy:** a `defineChannelModule({ name, channelClass, optionsToken, resolverToken? })` factory in core that produces the `forRoot` DynamicModule. The undefined-stripping spread can be a shared `compact(obj)` helper. Collapses ~30 LOC modules to ~5 LOC declarations.

### Spaghetti / boundary

**`shouldSend` / preference-gate / dedup / throttle / fallback / defer are layered across three classes via lazy `ModuleRef` lookups** — `channel-runner.ts:232` (`moduleRef.get(NOTIFICATION_DISPATCHER, { strict: false })`), `notification.service.ts:120-128` — **MEDIUM**
The runner reaches back into the dispatcher through a non-strict `ModuleRef` lookup to break a DI cycle (`SyncDispatcher → runner → dispatcher`), and `NotificationService.resolveContextAccessor()` does the same `try/catch` non-strict lookup. These are the symptom of decision logic (when to defer, when to re-queue) being split between `NotificationService.guardedDispatch` (throttle-defer) and `ChannelRunner.deferChannel` (gate-defer) — two re-queue-through-dispatcher implementations with the same shape. **Remedy:** not a blocker, but consider hoisting both defer paths into one "re-dispatch with delay + bypass flag" method, and injecting the dispatcher via a forward-ref provider rather than a stringly-typed strict:false lookup so the cycle is explicit and type-safe.

**`NotificationInput`/`NotifiableInput = object` forces `as Notification` casts on the hot path** — `core/src/interfaces.ts:41,152`, `notification.service.ts:228,238` — **LOW**
The public API accepts `object` (so decorator-only classes type-check), then immediately casts `notification as Notification` / `target as Notifiable` and duck-types every optional method. This is a deliberate, documented trade-off and the casts are localized, but it means the compiler gives zero help that a passed object is actually a notification. Acceptable as-is; flag only because it propagates `as` casts into otherwise-clean orchestration code.

## Largest files (>250 LOC; none exceed 600)

| File | LOC | Note |
|---|---|---|
| `core/src/notification.service.ts` | 417 | Cohesive (public facade + scope/guard/fallback wiring). Could shed the `ScopedNotifier` closure factory into its own file, but no decomposition required. |
| `core/src/interfaces.ts` | 369 | Mostly JSDoc; pure type/contract hub. Fine. |
| `testing/src/notification-fake.ts` | 302 | Test double. Fine. |
| `core/src/channel-runner.ts` | 275 | Delivery engine. Slightly dense (gate/defer/digest) but single-responsibility. |
| `core/src/decorators.ts` | 265 | Reflect-metadata canonical layer. Fine. |

**No file exceeds the 600 LOC threshold — file size is not a concern in this repo.**

## What's good
- **Clean canonical core.** Channel/route/tenant resolution lives once in `decorators.ts` (`getHandler`, `routeFor`, `resolveChannels`, `resolveTenants`) and is correctly reused by every adapter — no per-channel reimplementation of *routing/inference* logic. The duplication is purely in the imperative `send()` shell, not the brains.
- **Sound serializer boundary.** `serializer.ts` keeps async/cross-process concerns out of the sync path entirely ("Sync delivery never touches this"), and its `isRef`/`isSerialized` duck-typing is guarded by `Object.getPrototypeOf(value) === Object.prototype`, which is the right way to distinguish wire-form from live instances.
- **Disciplined optionality.** Heavy, consistent use of `exactOptionalPropertyTypes`-aware spreads and `@Optional()` injection; only 1 `@ts-ignore`/`@ts-expect-error` in the whole non-spec tree, and the ~43 `as`/`any` hits are concentrated in principled duck-typing (serializer, decorators) rather than scattered escape hatches.
- **Transport sub-abstraction is correct where it earns its keep.** `mail`/`sms`/`push` correctly separate a `*Transport` interface (Twilio/SES/FCM/Expo/WebPush) from the channel, and `PushTransport.sendMany?` with invalid-token reporting is a genuinely good multicast design — not over-abstracted.
