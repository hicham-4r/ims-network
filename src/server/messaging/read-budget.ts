import "server-only";

import {
  checkRateLimit,
  type RateLimitKind,
} from "@/server/redis/rate-limit";

type ReadKind =
  | "conversationInbox"
  | "messageHistory"
  | "messageRead";

export class MessagingReadBudgetError extends Error {
  constructor(
    readonly reason: "limited" | "unavailable",
  ) {
    super("Messaging is temporarily unavailable. Try again shortly.");
    this.name = "MessagingReadBudgetError";
  }
}

export async function requireMessagingReadBudget(
  kind: ReadKind,
  actorUserId: string,
) {
  // Preview intentionally has no Redis.
  // Its deployment protection and normal member authorization
  // remain required. Never apply this exception to message sending.
  const failurePolicy =
    process.env.VERCEL_ENV === "preview"
      ? "allow"
      : "deny";

  const decision = await checkRateLimit(
    kind satisfies RateLimitKind,
    actorUserId,
    failurePolicy,
  );

  if (!decision.allowed) {
    throw new MessagingReadBudgetError(
      decision.reason === "limited"
        ? "limited"
        : "unavailable",
    );
  }
}
