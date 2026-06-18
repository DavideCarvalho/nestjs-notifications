import { describe, expect, it } from 'vitest';
import { type QuietHours, evaluateQuietHours } from './quiet-hours';

/** Build a UTC Date for a given wall-clock UTC time today. */
function utcAt(hour: number, minute = 0): Date {
  const d = new Date('2026-06-17T00:00:00.000Z');
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

describe('evaluateQuietHours', () => {
  it('is inactive when disabled', () => {
    const q: QuietHours = { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' };
    expect(evaluateQuietHours(q, utcAt(23)).active).toBe(false);
  });

  it('is active inside a same-day window', () => {
    const q: QuietHours = { enabled: true, start: '09:00', end: '17:00', timezone: 'UTC' };
    const result = evaluateQuietHours(q, utcAt(12));
    expect(result.active).toBe(true);
    // resumes at 17:00 UTC → 5h after noon.
    expect(result.resumeAt).toBe(utcAt(17).getTime());
  });

  it('is inactive outside a same-day window', () => {
    const q: QuietHours = { enabled: true, start: '09:00', end: '17:00', timezone: 'UTC' };
    expect(evaluateQuietHours(q, utcAt(8)).active).toBe(false);
    expect(evaluateQuietHours(q, utcAt(18)).active).toBe(false);
  });

  it('handles a window that wraps midnight', () => {
    const q: QuietHours = { enabled: true, start: '22:00', end: '07:00', timezone: 'UTC' };
    expect(evaluateQuietHours(q, utcAt(23)).active).toBe(true);
    expect(evaluateQuietHours(q, utcAt(2)).active).toBe(true);
    expect(evaluateQuietHours(q, utcAt(12)).active).toBe(false);
  });

  it('respects the timezone (same instant, different zones)', () => {
    // 03:00 UTC. In America/Sao_Paulo (UTC-3) it's 00:00 → inside 22:00–07:00.
    const sp: QuietHours = {
      enabled: true,
      start: '22:00',
      end: '07:00',
      timezone: 'America/Sao_Paulo',
    };
    expect(evaluateQuietHours(sp, utcAt(3)).active).toBe(true);

    // Same 03:00 UTC. In Asia/Tokyo (UTC+9) it's 12:00 → outside the window.
    const tokyo: QuietHours = {
      enabled: true,
      start: '22:00',
      end: '07:00',
      timezone: 'Asia/Tokyo',
    };
    expect(evaluateQuietHours(tokyo, utcAt(3)).active).toBe(false);
  });

  it('treats a malformed window as inactive', () => {
    const q: QuietHours = { enabled: true, start: 'nope', end: '07:00', timezone: 'UTC' };
    expect(evaluateQuietHours(q, utcAt(3)).active).toBe(false);
  });
});
