/** A serializable SSE message routed through an {@link SseBackplane}. */
export interface SseBackplaneMessage {
  data: unknown;
  /** SSE event `type`. */
  event?: string | undefined;
}

/**
 * Cross-process fan-out for {@link import('./sse.hub').SseHub}.
 *
 * The default hub is **in-process** — a Subject per stream key — so a publish only reaches
 * subscribers connected to the SAME node. In a multi-pod deployment, the code that publishes a
 * notification and the node holding the user's SSE connection are often different processes (e.g. a
 * worker writes, an API pod streams). Supply a backplane (e.g. {@link RedisSseBackplane}) and a
 * publish on any node is broadcast to the SSE connections on every node.
 */
export interface SseBackplane {
  /** Broadcast `message` for `key` to all nodes (including this one). */
  publish(key: string, message: SseBackplaneMessage): void | Promise<void>;
  /**
   * Register the handler the hub uses to deliver inbound (cross-node) messages to its local
   * subscribers. Called once when the hub initializes.
   */
  subscribe(handler: (key: string, message: SseBackplaneMessage) => void): void | Promise<void>;
  /** Tear down any connections/subscriptions. Called on module destroy. */
  close?(): void | Promise<void>;
}
