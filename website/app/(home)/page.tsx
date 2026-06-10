import {
  ArrowRight,
  Bell,
  Boxes,
  Database,
  Eye,
  FlaskConical,
  Layers,
  Mail,
  MessageSquare,
  Plug,
  Radio,
  Send,
  Terminal,
  Webhook,
} from 'lucide-react';
import Link from 'next/link';

const GITHUB_URL = 'https://github.com/DavideCarvalho/nestjs-notifications';

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <BackgroundTexture />
      <Hero />
      <FanoutPreview />
      <FeatureGrid />
      <WireItIn />
      <FinalCta />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Background — dot grid + emerald glow, CSS only                             */
/* -------------------------------------------------------------------------- */

function BackgroundTexture() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.5]"
        style={{
          backgroundImage:
            'radial-gradient(circle at center, var(--color-fd-border) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)',
        }}
      />
      <div
        className="absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgb(16 185 129 / 0.18) 0%, rgb(16 185 129 / 0.05) 40%, transparent 70%)',
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                        */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-10 pt-20 text-center sm:pt-28">
      <div className="tele-stagger flex flex-col items-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/60 px-3 py-1 font-mono text-xs text-fd-muted-foreground backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="animate-tele-blink absolute inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Laravel Notifications, rebuilt for NestJS
        </span>

        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          One notification,{' '}
          <span className="bg-gradient-to-r from-emerald-500 to-teal-400 bg-clip-text text-transparent">
            every channel.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg text-fd-muted-foreground">
          Write a notification once. Send it over mail, the database, a websocket, and Slack —
          synchronously, or queued through your own BullMQ. Type-safe payloads, on-demand routing,
          and a decoupled core where every channel and dispatcher is an opt-in package.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 font-medium text-zinc-950 shadow-[0_0_24px_-6px] shadow-emerald-500/50 transition-all hover:bg-emerald-400 hover:shadow-emerald-400/60"
          >
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs/getting-started"
            className="rounded-lg border border-fd-border bg-fd-card/40 px-5 py-2.5 font-medium backdrop-blur transition-colors hover:bg-fd-accent"
          >
            Install in 5 minutes
          </Link>
          <a
            href={GITHUB_URL}
            className="rounded-lg border border-fd-border bg-fd-card/40 px-5 py-2.5 font-medium backdrop-blur transition-colors hover:bg-fd-accent"
          >
            GitHub
          </a>
        </div>

        <p className="mt-6 font-mono text-xs text-fd-muted-foreground">
          12 packages on npm · one notification, many channels · sync or queued · fully typed
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fan-out preview — one notification routed to many channels                 */
/* -------------------------------------------------------------------------- */

interface ChannelRow {
  icon: typeof Mail;
  channel: string;
  detail: string;
  status: string;
  statusColor: string;
  dot: string;
}

const CHANNEL_ROWS: readonly ChannelRow[] = [
  {
    icon: Mail,
    channel: 'mail',
    detail: 'ada@example.com · "Invoice INV-1 paid"',
    status: 'sent',
    statusColor: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
  {
    icon: Database,
    channel: 'database',
    detail: 'User#42 · stored for in-app feed',
    status: 'saved',
    statusColor: 'text-sky-400',
    dot: 'bg-sky-400',
  },
  {
    icon: Radio,
    channel: 'broadcast',
    detail: 'room user:42 · realtime push',
    status: 'live',
    statusColor: 'text-violet-300',
    dot: 'bg-violet-400',
  },
  {
    icon: MessageSquare,
    channel: 'slack',
    detail: '#billing · Block Kit message',
    status: 'sent',
    statusColor: 'text-amber-300',
    dot: 'bg-amber-400',
  },
];

function FanoutPreview() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="relative">
        <div
          aria-hidden
          className="absolute -inset-x-10 -bottom-8 top-10 -z-10 rounded-[2rem] bg-emerald-500/10 blur-3xl"
        />
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 ring-1 ring-white/5">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/70 px-4 py-3">
            <span className="size-3 rounded-full bg-zinc-700" />
            <span className="size-3 rounded-full bg-zinc-700" />
            <span className="size-3 rounded-full bg-zinc-700" />
            <span className="ml-3 font-mono text-xs text-zinc-500">notifications · fan-out</span>
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
              <span className="animate-tele-blink size-1.5 rounded-full bg-emerald-400" />
              delivering
            </span>
          </div>

          <div className="grid gap-px bg-zinc-800/60 lg:grid-cols-[1fr_1.4fr]">
            {/* the single call */}
            <div className="bg-zinc-950 p-5">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-emerald-400">
                One call
              </h3>
              <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed">
                <code>
                  <span className="text-zinc-500">await</span>{' '}
                  <span className="text-zinc-300">notifications.</span>
                  <span className="text-sky-400">send</span>
                  <span className="text-zinc-300">(</span>
                  {'\n'}
                  {'  '}
                  <span className="text-zinc-300">user,</span>
                  {'\n'}
                  {'  '}
                  <span className="text-zinc-500">new</span>{' '}
                  <span className="text-emerald-400">InvoicePaid</span>
                  <span className="text-zinc-300">(invoice),</span>
                  {'\n'}
                  <span className="text-zinc-300">);</span>
                </code>
              </pre>
              <p className="mt-4 font-mono text-[11px] leading-relaxed text-zinc-600">
                via() returns the channels.
                <br />
                each channel reads its own payload.
              </p>
            </div>

            {/* fans out to channels */}
            <div className="bg-zinc-950 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-400">
                  Four channels
                </h3>
                <span className="font-mono text-[10px] text-zinc-600">isolated · per-channel</span>
              </div>
              <div className="space-y-px font-mono text-xs">
                {CHANNEL_ROWS.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div
                      key={row.channel}
                      className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-zinc-900"
                    >
                      <span className={`size-1.5 shrink-0 rounded-full ${row.dot}`} />
                      <Icon className="size-3.5 shrink-0 text-zinc-500" />
                      <span className="w-20 shrink-0 text-zinc-300">{row.channel}</span>
                      <span className="min-w-0 flex-1 truncate text-zinc-500">{row.detail}</span>
                      <span className={`shrink-0 ${row.statusColor}`}>{row.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feature grid                                                                */
/* -------------------------------------------------------------------------- */

interface Feature {
  icon: typeof Mail;
  title: string;
  body: string;
  accent: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: Layers,
    title: 'Channels, decoupled',
    body: 'Mail, database, broadcast and Slack — each an opt-in package. The core knows only an interface; channels are discovered from the Nest container, never hard-wired.',
    accent: 'text-emerald-400',
  },
  {
    icon: Send,
    title: 'Sync or queued',
    body: 'Deliver inline by default, or set shouldQueue and route through an async dispatcher — in-process events, Redis, or the BullMQ you already run. Channels and dispatch are orthogonal.',
    accent: 'text-violet-400',
  },
  {
    icon: FlaskConical,
    title: 'Type-safe payloads',
    body: 'Each channel exports an interface your notification implements, so toMail, toDatabase and toSlack are checked at compile time. Forget one and TypeScript tells you.',
    accent: 'text-sky-400',
  },
  {
    icon: Webhook,
    title: 'On-demand routing',
    body: 'No entity? Send straight to an address — notifications.route("mail", "ops@x.com").notify(...). Chain extra routes for one-off, multi-channel blasts.',
    accent: 'text-amber-400',
  },
  {
    icon: Database,
    title: 'Bring your ORM',
    body: 'The database channel persists through a NotificationStore interface. Ship with the in-memory store, or plug the TypeORM or MikroORM adapter — write your own in a few methods.',
    accent: 'text-teal-400',
  },
  {
    icon: Bell,
    title: 'Faithful to Laravel',
    body: 'send, via, toMail, sendNow, queued notifications, on-demand routing. If you know Laravel notifications, you already know this API.',
    accent: 'text-orange-400',
  },
  {
    icon: Eye,
    title: 'Observable',
    body: 'Lifecycle events for every send, plus a first-class nestjs-telescope watcher that records each delivery — channel, recipient, payload, failure reason — in the dashboard.',
    accent: 'text-fuchsia-400',
  },
  {
    icon: Plug,
    title: 'Resilient by default',
    body: 'One channel failing never blocks the others. Choose continue-on-error or fail-fast; failures surface as events so you can alert, retry or log.',
    accent: 'text-cyan-400',
  },
  {
    icon: Boxes,
    title: 'Built to test',
    body: 'A NotificationFake swaps the real service in tests, with Laravel-style assertions — assertSentTo, assertSentOnChannel, assertNothingSent. No SMTP, no queue, no flake.',
    accent: 'text-rose-400',
  },
];

function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything a notification layer needs
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-fd-muted-foreground">
          Define once, deliver everywhere. Pick your channels, pick your dispatcher, and let the
          core wire them together.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-fd-border bg-fd-card/50 p-5 backdrop-blur transition-colors hover:border-emerald-500/40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(120px circle at top right, rgb(16 185 129 / 0.1), transparent 70%)',
        }}
      />
      <div className="relative">
        <span className="inline-flex size-9 items-center justify-center rounded-lg border border-fd-border bg-fd-background/60">
          <Icon className={`size-4.5 ${feature.accent}`} />
        </span>
        <h3 className="mt-4 font-medium">{feature.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{feature.body}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Wire it in — code snippet with window chrome                               */
/* -------------------------------------------------------------------------- */

const CODE_LINES: readonly { tokens: { text: string; cls?: string }[] }[] = [
  {
    tokens: [
      { text: 'class ', cls: 'text-violet-400' },
      { text: 'InvoicePaid', cls: 'text-emerald-400' },
      { text: ' implements ', cls: 'text-violet-400' },
      { text: 'Notification, MailNotification', cls: 'text-sky-400' },
      { text: ' {' },
    ],
  },
  {
    tokens: [
      { text: '  ' },
      { text: 'via', cls: 'text-sky-400' },
      { text: '() { ' },
      { text: 'return', cls: 'text-violet-400' },
      { text: " ['mail', 'database']; }", cls: 'text-teal-300' },
    ],
  },
  {
    tokens: [
      { text: '  ' },
      { text: 'toMail', cls: 'text-sky-400' },
      { text: '() {' },
    ],
  },
  {
    tokens: [
      { text: '    ' },
      { text: 'return', cls: 'text-violet-400' },
      { text: ' new ', cls: 'text-violet-400' },
      { text: 'MailMessage', cls: 'text-emerald-400' },
      { text: '()' },
    ],
  },
  {
    tokens: [
      { text: '      .' },
      { text: 'subject', cls: 'text-sky-400' },
      { text: "('Invoice paid')", cls: 'text-teal-300' },
    ],
  },
  {
    tokens: [
      { text: '      .' },
      { text: 'line', cls: 'text-sky-400' },
      { text: "('Thanks for your payment.');", cls: 'text-teal-300' },
    ],
  },
  { tokens: [{ text: '  }' }] },
  { tokens: [{ text: '}' }] },
];

function WireItIn() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-emerald-500">
            Wire it in
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            One class. That&apos;s the notification.
          </h2>
          <p className="mt-4 text-fd-muted-foreground">
            A notification is a plain class:{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">via()</code> lists
            the channels, and a{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">
              to&lt;Channel&gt;()
            </code>{' '}
            method shapes each payload. Register the channels you want once in your module, then{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">send</code> from
            anywhere.
          </p>
          <Link
            href="/docs/getting-started"
            className="mt-6 inline-flex items-center gap-2 font-medium text-emerald-500 transition-colors hover:text-emerald-400"
          >
            Full setup guide
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/30 ring-1 ring-white/5">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/70 px-4 py-2.5">
            <Terminal className="size-3.5 text-zinc-500" />
            <span className="font-mono text-xs text-zinc-500">invoice-paid.notification.ts</span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            <code>
              {CODE_LINES.map((line, lineIndex) => (
                <div key={lineIndex} className="whitespace-pre">
                  {line.tokens.map((token, tokenIndex) => (
                    <span key={tokenIndex} className={token.cls ?? 'text-zinc-300'}>
                      {token.text}
                    </span>
                  ))}
                  {line.tokens.length === 0 ? ' ' : null}
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Final CTA                                                                   */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-28">
      <div className="relative overflow-hidden rounded-2xl border border-fd-border bg-fd-card/60 px-6 py-14 text-center backdrop-blur">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 60% 100% at 50% 0%, rgb(16 185 129 / 0.14), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.4]"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, var(--color-fd-border) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            maskImage: 'radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent 80%)',
          }}
        />
        <span className="inline-flex items-center gap-2 font-mono text-xs text-emerald-500">
          <Mail className="size-4" />
          <Radio className="size-4" />
          <Boxes className="size-4" />
        </span>
        <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Stop wiring notifications by hand.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-fd-muted-foreground">
          Define a notification once, pick your channels, and ship — sync today, queued tomorrow,
          without touching the call site.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-2.5 font-medium text-zinc-950 shadow-[0_0_24px_-6px] shadow-emerald-500/50 transition-all hover:bg-emerald-400 hover:shadow-emerald-400/60"
          >
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={GITHUB_URL}
            className="rounded-lg border border-fd-border bg-fd-background/40 px-6 py-2.5 font-medium transition-colors hover:bg-fd-accent"
          >
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
