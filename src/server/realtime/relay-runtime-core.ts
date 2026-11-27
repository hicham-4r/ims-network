/**
 * Framework-independent lifecycle for a single, lazily created relay bridge.
 * This module never opens sockets or talks to Redis on its own.
 */
export type AuthenticatedRelayBridge = {
  attachAuthenticatedUser(userId: string): () => void;
};

export function createLazyRelayAttacher(
  factory: () => AuthenticatedRelayBridge,
) {
  let bridge: AuthenticatedRelayBridge | null = null;

  return (authenticatedUserId: string, enabled: boolean): (() => void) => {
    // The production/preview runtime owns the feature gate. Disabled means
    // no bridge construction and zero associated Redis commands.
    if (!enabled) return () => {};

    if (
      typeof authenticatedUserId !== "string" ||
      !authenticatedUserId.trim() ||
      authenticatedUserId.length > 255
    ) {
      throw new Error("Invalid authenticated member identifier.");
    }

    if (!bridge) bridge = factory();
    const detach = bridge.attachAuthenticatedUser(authenticatedUserId);

    // A WebSocket may emit both error and close; only detach once.
    let released = false;
    return () => {
      if (released) return;
      released = true;
      detach();
    };
  };
}
