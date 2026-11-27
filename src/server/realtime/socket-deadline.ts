/**
 * Phase 16.19H: bounded, graceful socket-lifetime teardown.
 * Supports a bounded 150-second Preview relay trial lease; WS-only remains 30 seconds.
 * No auth, network, Redis, database or Vercel API is used in this helper.
 */
export type SocketDeadlineDependencies<TTimer> = Readonly<{
  schedule(callback: () => void, delayMs: number): TTimer;
  cancel(timer: TTimer): void;
  cleanup(): void;
  closeGracefully(): void;
  forceTerminate(): void;
}>;

// Only the two reviewed trial durations are accepted. Do not let an env var
// become an arbitrary unbounded function lifetime.
export type SocketTrialLifetimeMs = 30_000 | 150_000;
const CLOSE_GRACE_MS = 2_000;

/**
 * Cleanup happens immediately on expiration, before the close handshake.
 * An unresponsive peer is force-terminated after a short grace period.
 * Calling dispose() from close/error/revocation is safe and idempotent.
 */
export function createSocketDeadline<TTimer>(
  deps: SocketDeadlineDependencies<TTimer>,
  lifetimeMs: SocketTrialLifetimeMs = 30_000,
) {
  let disposed = false;
  let cleanupCalled = false;
  let lifetimeTimer: TTimer | null = null;
  let fallbackTimer: TTimer | null = null;

  function cleanupOnce() {
    if (cleanupCalled) return;
    cleanupCalled = true;
    deps.cleanup();
  }

  function cancelTimers() {
    if (lifetimeTimer !== null) {
      deps.cancel(lifetimeTimer);
      lifetimeTimer = null;
    }
    if (fallbackTimer !== null) {
      deps.cancel(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelTimers();
    cleanupOnce();
  }

  function forceTerminate() {
    if (disposed) return;
    disposed = true;
    cancelTimers();
    try {
      cleanupOnce();
    } finally {
      deps.forceTerminate();
    }
  }

  lifetimeTimer = deps.schedule(() => {
    lifetimeTimer = null;
    if (disposed) return;

    // Release local hub and Redis subscriptions before closing.
    try {
      cleanupOnce();
    } catch {
      forceTerminate();
      return;
    }

    try {
      deps.closeGracefully();
    } catch {
      forceTerminate();
      return;
    }

    // If ws emits 'close' synchronously, dispose() has already run.
    if (!disposed) {
      fallbackTimer = deps.schedule(forceTerminate, CLOSE_GRACE_MS);
    }
  }, lifetimeMs);

  return { dispose };
}
