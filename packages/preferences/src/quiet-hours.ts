/**
 * Quiet-hours window for a notifiable (and/or category). During the window, instant delivery is
 * suppressed and deferred to after the window rather than dropped.
 *
 * Times are wall-clock `"HH:mm"` (24h) interpreted in {@link timezone} (an IANA zone like
 * `"America/Sao_Paulo"`). A window may wrap midnight (`start: "22:00"`, `end: "07:00"`).
 *
 * Modelled after Knock's preference-level quiet hours / Novu's "do not disturb" windows: a single
 * recurring daily window expressed in the recipient's own timezone.
 */
export interface QuietHours {
  /** Whether the window is active. A disabled window never defers. */
  enabled: boolean;
  /** Window start, `"HH:mm"` 24h wall-clock in {@link timezone}. */
  start: string;
  /** Window end, `"HH:mm"` 24h wall-clock in {@link timezone}. May be earlier than start (wraps). */
  end: string;
  /** IANA timezone the wall-clock times are interpreted in (e.g. `"America/New_York"`). */
  timezone: string;
}

/** Parse `"HH:mm"` to minutes-since-midnight, or `null` when malformed. */
function parseHHmm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Read the wall-clock minute-of-day for `now` in `timezone` using `Intl` (no external deps). The
 * `en-GB` locale yields a 24h `HH:mm`. Falls back to UTC if the zone is unknown.
 */
function minutesOfDayInZone(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    // Intl can render "24" for midnight in some engines; normalize to 0.
    return ((hour % 24) * 60 + minute) % (24 * 60);
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/** Whether `minute` (minute-of-day) falls within a `[start, end)` window that may wrap midnight. */
function inWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false; // empty window
  if (start < end) return minute >= start && minute < end;
  // Wrapping window (e.g. 22:00–07:00): inside if after start OR before end.
  return minute >= start || minute < end;
}

/** Result of evaluating a quiet-hours window for an instant `now`. */
export interface QuietHoursEvaluation {
  /** Whether `now` is inside the quiet-hours window. */
  active: boolean;
  /** When active, the absolute epoch-ms the window ends (i.e. when delivery should resume). */
  resumeAt?: number;
}

/**
 * Evaluate a quiet-hours window at `now`. When the window is active, returns `resumeAt`: the next
 * absolute time the `end` wall-clock occurs in the configured timezone — the instant delivery
 * should resume. Returns `{ active: false }` when disabled, malformed, or outside the window.
 */
export function evaluateQuietHours(
  quiet: QuietHours,
  now: Date = new Date(),
): QuietHoursEvaluation {
  if (!quiet.enabled) return { active: false };
  const start = parseHHmm(quiet.start);
  const end = parseHHmm(quiet.end);
  if (start === null || end === null) return { active: false };

  const minute = minutesOfDayInZone(now, quiet.timezone);
  if (!inWindow(minute, start, end)) return { active: false };

  // Compute how many minutes until `end` (wall-clock) and add to now. Because we only need a
  // delay, working in minute deltas in the zone is exact enough (DST shifts at most ~1h, and the
  // gate re-checks on redelivery via the bypass flag, so a small skew is harmless).
  const minutesUntilEnd = (end - minute + 24 * 60) % (24 * 60) || 24 * 60;
  const resumeAt = now.getTime() + minutesUntilEnd * 60_000;
  return { active: true, resumeAt };
}
