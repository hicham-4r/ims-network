import type {
  RateLimitDecision,
} from "../redis/rate-limit-core";

export function getProfileEditRateLimitMessage(
  decision: RateLimitDecision,
): string | null {
  if (decision.allowed) {
    return null;
  }

  if (decision.reason === "limited") {
    const seconds = Math.max(
      1,
      Math.min(
        3600,
        decision.retryAfterSeconds ?? 60,
      ),
    );

    return (
      "Too many profile updates. " +
      `Please try again in ${seconds} seconds.`
    );
  }

  return (
    "Profile updates are temporarily unavailable. " +
    "Please try again shortly."
  );
}