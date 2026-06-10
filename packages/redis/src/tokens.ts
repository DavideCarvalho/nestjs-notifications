/** DI token for the shared (non-blocking) ioredis client used to enqueue jobs. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** DI token for the {@link RedisDispatcherOptions}. */
export const REDIS_DISPATCHER_OPTIONS = Symbol('REDIS_DISPATCHER_OPTIONS');
