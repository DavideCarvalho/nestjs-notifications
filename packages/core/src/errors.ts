/** Thrown when a notification asks for a channel that no driver was registered for. */
export class ChannelNotRegisteredError extends Error {
  constructor(
    public readonly channel: string,
    available: string[],
  ) {
    const registered = available.length ? available.join(', ') : '(none)';
    super(
      `No driver registered for channel "${channel}". Registered channels: ${registered}. Did you forget to import the channel's module?`,
    );
    this.name = 'ChannelNotRegisteredError';
  }
}

/** Thrown when a channel was asked to send a notification missing its `to<Channel>` method. */
export class MissingChannelMethodError extends Error {
  constructor(channel: string, method: string, notificationName: string) {
    super(
      `Notification "${notificationName}" is routed to the "${channel}" channel but does not implement ${method}(). Implement it to define the channel payload.`,
    );
    this.name = 'MissingChannelMethodError';
  }
}

/** Aggregates per-channel failures from a single notification delivery. */
export class NotificationDeliveryError extends Error {
  constructor(public readonly failures: Array<{ channel: string; error: unknown }>) {
    const channels = failures.map((f) => f.channel).join(', ');
    super(`Notification delivery failed on ${failures.length} channel(s): ${channels}`);
    this.name = 'NotificationDeliveryError';
  }
}

/** Thrown when an async notification cannot be serialized or rehydrated. */
export class NotificationSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationSerializationError';
  }
}
