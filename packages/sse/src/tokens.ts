/** DI token for the resolved {@link SseChannelOptions} (event name, etc.). */
export const SSE_OPTIONS = Symbol('SSE_OPTIONS');

/** DI token for the optional {@link import('./backplane').SseBackplane} (cross-pod fan-out). */
export const SSE_BACKPLANE = Symbol('SSE_BACKPLANE');
