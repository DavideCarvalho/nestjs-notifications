import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SnsTransport } from './sns.transport';

const clientSend = vi.fn();
const SnsCtor = vi.fn();
const PublishCommandCtor = vi.fn();

vi.mock('@aws-sdk/client-sns', () => {
  return {
    SNSClient: class {
      send = clientSend;
      constructor(config: unknown) {
        SnsCtor(config);
      }
    },
    PublishCommand: class {
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
        PublishCommandCtor(input);
      }
    },
  };
});

describe('SnsTransport', () => {
  beforeEach(() => {
    clientSend.mockReset();
    SnsCtor.mockReset();
    PublishCommandCtor.mockReset();
    clientSend.mockResolvedValue({ MessageId: 'abc' });
  });

  it('constructs the client with region and credentials', () => {
    new SnsTransport({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AK', secretAccessKey: 'SK' },
    });
    expect(SnsCtor).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AK', secretAccessKey: 'SK' },
    });
  });

  it('publishes to the recipient phone number with the message text', async () => {
    const transport = new SnsTransport({ region: 'us-east-1' });

    await transport.send({ to: '+15555551234', text: 'Hello' });

    expect(clientSend).toHaveBeenCalledOnce();
    expect(PublishCommandCtor).toHaveBeenCalledWith({
      PhoneNumber: '+15555551234',
      Message: 'Hello',
      MessageAttributes: undefined,
    });
  });

  it('adds the SenderID message attribute when configured', async () => {
    const transport = new SnsTransport({ region: 'us-east-1', senderId: 'Acme' });

    await transport.send({ to: '+15555551234', text: 'Hi' });

    expect(PublishCommandCtor).toHaveBeenCalledWith({
      PhoneNumber: '+15555551234',
      Message: 'Hi',
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: 'Acme' },
      },
    });
  });
});
