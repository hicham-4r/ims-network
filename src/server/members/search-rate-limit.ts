import type {
  RateLimitDecision,
} from "../redis/rate-limit-core";

export class MemberDirectoryRateLimitError extends Error {
  readonly retryAfterSeconds: number | null;
  readonly unavailable: boolean;

  constructor(decision: RateLimitDecision) {
    const unavailable = decision.reason === "unavailable";

    super(
      unavailable
        ? "Directory temporarily unavailable."
        : "Too many directory requests.",
    );

    this.name = "MemberDirectoryRateLimitError";
    this.unavailable = unavailable;

    this.retryAfterSeconds = unavailable
      ? null
      : Math.max(
          1,
          Math.min(3600, decision.retryAfterSeconds ?? 60),
        );
  }
}

export function enforceMemberDirectoryRateLimit(
  decision: RateLimitDecision,
): void {
  if (!decision.allowed) {
    throw new MemberDirectoryRateLimitError(decision);
  }
}