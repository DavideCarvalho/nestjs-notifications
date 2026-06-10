/** Configuration for the Redis dispatcher and its worker. */
export interface RedisDispatcherOptions {
  /** ioredis connection: a URL string or a host/port (+optional password) object. */
  connection: string | { host: string; port: number; password?: string };
  /** Redis list key used as the job queue. Defaults to `nestjs-notifications:jobs`. */
  key?: string;
}

/** Default Redis list key when {@link RedisDispatcherOptions.key} is omitted. */
export const DEFAULT_KEY = 'nestjs-notifications:jobs';
