export type FailurePolicy = "allow" | "deny";

export type RateLimitBackend = {
  limit(identifier: string): Promise<{
    success: boolean;
    reset: number;
    reason?: string;
  }>;
};

export type RateLimitDecision = {
  allowed: boolean;
  reason: "allowed" | "limited" | "unavailable";
  retryAfterSeconds: number | null;
};

export async function evaluateRateLimit(
  backend: RateLimitBackend | null,
  identifier: string,
  failurePolicy: FailurePolicy,
  nowMs: number = Date.now(),
): Promise<RateLimitDecision> {
  if (!identifier || identifier.length > 256) {
    throw new Error("Invalid rate-limit identifier.");
  }

  const unavailable = (): RateLimitDecision => ({
    allowed: failurePolicy === "allow",
    reason: "unavailable",
    retryAfterSeconds: null,
  });

  if (!backend) {
    return unavailable();
  }

  try {
    const result = await backend.limit(identifier);

    // The SDK may return success=true on timeout.
    // Never confuse this with a successful Redis check.
    if (result.reason === "timeout") {
      return unavailable();
    }

    if (result.success) {
      return {
        allowed: true,
        reason: "allowed",
        retryAfterSeconds: 0,
      };
    }

    const retryAfterSeconds =
      Number.isFinite(result.reset)
        ? Math.max(
            1,
            Math.min(
              3600,
              Math.ceil((result.reset - nowMs) / 1000),
            ),
          )
        : 60;

    return {
      allowed: false,
      reason: "limited",
      retryAfterSeconds,
    };
  } catch {
    return unavailable();
  }
}