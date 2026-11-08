import { describe, expect, it } from 'vitest';
import { createNotificationsStreamController } from './stream-controller';

describe('removed `guards` option', () => {
  it('createNotificationsStreamController refuses `guards` instead of mounting open', () => {
    expect(() =>
      createNotificationsStreamController({ resolveRoute: () => '1', guards: [] } as any),
    ).toThrow(/`guards` option was removed.*decorators/);
  });
});
