import { describe, expect, it } from 'vitest';
import { createSesNotificationController } from './ses.controller';
import { createTwilioStatusController } from './twilio.controller';

describe('removed `guards` option', () => {
  it('createSesNotificationController refuses `guards`', () => {
    expect(() =>
      createSesNotificationController({ topicArns: ['arn:x'], guards: [] } as any),
    ).toThrow(/`guards` option was removed.*decorators/);
  });

  it('createTwilioStatusController refuses `guards`', () => {
    expect(() => createTwilioStatusController({ authToken: 't', guards: [] } as any)).toThrow(
      /`guards` option was removed.*decorators/,
    );
  });
});
