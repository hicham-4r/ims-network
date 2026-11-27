/**
 * Pure pacing guards for the lazy Redis Stream reader.
 * Do not import providers or access environment variables from this module.
 */
import { RELAY_BLOCK_MS } from "./relay-protocol";

/** For unexpectedly early empty XREAD replies; ordinary 30s reads add no wait. */
export function emptyReadDelayMs(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return RELAY_BLOCK_MS;
  }
  return Math.max(0, RELAY_BLOCK_MS - Math.floor(elapsedMs));
}

/** Back off persistent connection/read failures without a tight retry storm. */
export function failureRetryDelayMs(consecutiveFailures: number): number {
  if (!Number.isSafeInteger(consecutiveFailures) || consecutiveFailures < 1) {
    throw new Error("Invalid reader failure count.");
  }
  // 1s, 2s, 4s, 8s, ... 120s maximum. One failed instance is
  // bounded to roughly 720 retries/day after the backoff stabilizes.
  return Math.min(120_000, 1_000 * 2 ** Math.min(consecutiveFailures - 1, 7));
}
