import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VonageTransport } from './vonage.transport';

const smsSend = vi.fn();
const VonageCtor = vi.fn();

vi.mock('@vonage/server-sdk', () => {
  return {
    Vonage: class {
      sms = { send: smsSend };
      constructor(creds: unknown) {
        VonageCtor(creds);
      }
    },
  };
});

describe('VonageTransport', () => {
  beforeEach(() => {
    smsSend.mockReset();
    VonageCtor.mockReset();
    smsSend.mockResolvedValue({ messages: [{ status: '0' }] });
  });

  it('constructs the client with the injected credentials', () => {
    new VonageTransport({ apiKey: 'KEY', apiSecret: 'SECRET' });
    expect(VonageCtor).toHaveBeenCalledWith({ apiKey: 'KEY', apiSecret: 'SECRET' });
  });

  it('sends the mapped payload, falling back to the default from', async () => {
    const transport = new VonageTransport({ apiKey: 'KEY', apiSecret: 'SECRET', from: 'Acme' });

    await transport.send({ to: '+15555551234', text: 'Hello' });

    expect(smsSend).toHaveBeenCalledWith({
      to: '+15555551234',
      from: 'Acme',
      text: 'Hello',
    });
  });

  it('honors a per-message from override', async () => {
    const transport = new VonageTransport({ apiKey: 'KEY', apiSecret: 'SECRET', from: 'Acme' });

    await transport.send({ to: '+15555551234', from: 'Other', text: 'Hi' });

    expect(smsSend).toHaveBeenCalledWith({
      to: '+15555551234',
      from: 'Other',
      text: 'Hi',
    });
  });
});
