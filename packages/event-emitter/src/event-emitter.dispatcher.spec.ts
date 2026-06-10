import type {
  ChannelRunner,
  NotificationJob,
  NotificationSerializer,
} from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it, vi } from 'vitest';
import { EventEmitterDispatcher, PROCESS_EVENT } from './event-emitter.dispatcher';

function makeEmitter() {
  const listeners: Record<string, ((job: NotificationJob) => unknown)[]> = {};
  return {
    emit: vi.fn((event: string, job: NotificationJob) => {
      for (const l of listeners[event] ?? []) l(job);
    }),
    on(event: string, listener: (job: NotificationJob) => unknown) {
      listeners[event] ??= [];
      listeners[event].push(listener);
    },
  };
}

describe('EventEmitterDispatcher', () => {
  const notifiable = { routeNotificationFor: () => 'addr' };
  const notification = { via: () => ['mail'] };
  const job: NotificationJob = { notifiable, notification, channels: ['mail'] };

  it('dispatch emits the process event without blocking on delivery', async () => {
    const emitter = makeEmitter();
    const serializer = { hydrateJob: vi.fn() } as unknown as NotificationSerializer;
    const runner = { run: vi.fn() } as unknown as ChannelRunner;

    const dispatcher = new EventEmitterDispatcher(serializer, runner, emitter as never);
    await dispatcher.dispatch(job);

    expect(emitter.emit).toHaveBeenCalledWith(PROCESS_EVENT, job);
    // dispatch must not run channels itself.
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('handler hydrates the job and runs the right channels', async () => {
    const emitter = makeEmitter();
    const serializer = {
      hydrateJob: vi.fn().mockResolvedValue({ notifiable, notification }),
    } as unknown as NotificationSerializer;
    const runner = { run: vi.fn().mockResolvedValue(undefined) } as unknown as ChannelRunner;

    const dispatcher = new EventEmitterDispatcher(serializer, runner, emitter as never);

    await dispatcher.handle(job);

    expect(serializer.hydrateJob).toHaveBeenCalledWith(job);
    expect(runner.run).toHaveBeenCalledWith(notifiable, notification, ['mail']);
  });
});
