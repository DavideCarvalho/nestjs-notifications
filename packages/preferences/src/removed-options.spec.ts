import { describe, expect, it } from 'vitest';
import { createPreferenceCenterController } from './preference-center.controller';

describe('removed `guards` option', () => {
  it('createPreferenceCenterController refuses `guards` instead of mounting open', () => {
    expect(() =>
      createPreferenceCenterController({
        resolveRef: () => ({ type: 'User', id: '1' }),
        guards: [],
      } as any),
    ).toThrow(/`guards` option was removed.*decorators/);
  });
});
