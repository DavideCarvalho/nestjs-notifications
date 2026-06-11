import {
  Inject,
  Injectable,
  type MessageEvent,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { type Observable, Subject, finalize } from 'rxjs';
import type { SseBackplane, SseBackplaneMessage } from './backplane';
import { SSE_BACKPLANE } from './tokens';

/**
 * Fan-out for native NestJS Server-Sent Events. Keeps one {@link Subject} per stream key; the
 * channel pushes events into it via {@link SseHub.publish} and a controller's `@Sse()` endpoint
 * reads from it via {@link SseHub.stream}.
 *
 * Each key may have multiple concurrent subscribers (e.g. a user with several open tabs). The
 * Subject is created lazily on first subscribe and torn down once the last subscriber unsubscribes.
 *
 * By default delivery is **in-process**. Provide an {@link SseBackplane} (e.g. Redis pub/sub) to
 * fan out across pods: a publish on any node then reaches the SSE connections on every node.
 */
@Injectable()
export class SseHub implements OnModuleInit, OnModuleDestroy {
  private readonly subjects = new Map<string, Subject<MessageEvent>>();
  private readonly refcounts = new Map<string, number>();

  constructor(
    @Optional()
    @Inject(SSE_BACKPLANE)
    private readonly backplane?: SseBackplane,
  ) {}

  async onModuleInit(): Promise<void> {
    // Inbound messages from other nodes are delivered to this node's local subscribers.
    if (this.backplane) {
      await this.backplane.subscribe((key, message) => this.deliverLocal(key, message));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.backplane?.close?.();
  }

  /**
   * Return the live stream for `key` as an Observable. Subscribing creates the underlying Subject
   * (if absent) and bumps its refcount; unsubscribing decrements it and removes the Subject once no
   * subscribers remain. Return this directly from a controller's `@Sse()` method.
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
   * Push a message to every subscriber of `key`. With a backplane it's broadcast to all nodes
   * (delivered back through the backplane subscription, including to this node); without one it's
   * delivered to local subscribers directly. `options.event` sets the SSE event `type`.
   */
  publish(key: string, data: unknown, options?: { event?: string }): void {
    const message: SseBackplaneMessage = { data, event: options?.event };
    if (this.backplane) {
      void this.backplane.publish(key, message);
      return;
    }
    this.deliverLocal(key, message);
  }

  /** Deliver a message to this node's local subscribers of `key` (no-op when none). */
  private deliverLocal(key: string, message: SseBackplaneMessage): void {
    const subject = this.subjects.get(key);
    if (!subject) return;
    const data = message.data as MessageEvent['data'];
    subject.next(message.event ? { data, type: message.event } : { data });
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
