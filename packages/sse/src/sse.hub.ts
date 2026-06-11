import { Injectable, type MessageEvent } from '@nestjs/common';
import { type Observable, Subject, finalize } from 'rxjs';

/**
 * In-memory fan-out for native NestJS Server-Sent Events. Keeps one
 * {@link Subject} per stream key; the channel pushes events into it via
 * {@link SseHub.publish} and a controller's `@Sse()` endpoint reads from it via
 * {@link SseHub.stream}.
 *
 * Each key may have multiple concurrent subscribers (e.g. a user with several
 * open tabs). The Subject is created lazily on first subscribe and torn down
 * once the last subscriber unsubscribes.
 */
@Injectable()
export class SseHub {
  private readonly subjects = new Map<string, Subject<MessageEvent>>();
  private readonly refcounts = new Map<string, number>();

  /**
   * Return the live stream for `key` as an Observable. Subscribing creates the
   * underlying Subject (if absent) and bumps its refcount; unsubscribing
   * decrements it and removes the Subject once no subscribers remain. Return
   * this directly from a controller's `@Sse()` method.
   */
  stream(key: string): Observable<MessageEvent> {
    const subject = this.subjectFor(key);
    this.refcounts.set(key, (this.refcounts.get(key) ?? 0) + 1);

    return subject.asObservable().pipe(
      finalize(() => {
        const next = (this.refcounts.get(key) ?? 1) - 1;
        if (next <= 0) {
          this.refcounts.delete(key);
          this.subjects.delete(key);
          subject.complete();
        } else {
          this.refcounts.set(key, next);
        }
      }),
    );
  }

  /**
   * Push a `MessageEvent` to every subscriber of `key`. No-ops when nobody is
   * listening (no Subject exists), since SSE is fire-and-forget. `options.event`
   * sets the SSE event `type`.
   */
  publish(key: string, data: unknown, options?: { event?: string }): void {
    const subject = this.subjects.get(key);
    if (!subject) return;

    const data_ = data as MessageEvent['data'];
    const message: MessageEvent = options?.event
      ? { data: data_, type: options.event }
      : { data: data_ };
    subject.next(message);
  }

  private subjectFor(key: string): Subject<MessageEvent> {
    let subject = this.subjects.get(key);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.subjects.set(key, subject);
    }
    return subject;
  }
}
