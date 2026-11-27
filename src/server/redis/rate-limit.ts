import "server-only";
import { reportFailure } from "@/server/observability/safe-events";

import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";

import { serverEnv } from "@/server/env";

import {
  redis,
  redisKeyPrefix,
} from "./client";

import {
  evaluateRateLimit,
  type FailurePolicy,
} from "./rate-limit-core";

export type RateLimitKind =
  | "privacyExport"
  | "privacyDeletion"
  | "recoveryCode"
  | "ownerRole"
  | "avatarUpload"
  | "adminModeration"
  | "auth"
  | "signup"
  | "recovery"
  | "memberSearch"
  | "profileEdit"
  | "messageReport"
  | "chatActivity"
  | "messageDelivery"
  | "messageReaction"
  | "messageSend"
  | "conversationOpen"
  | "conversationInbox"
  | "messageHistory"
  | "messageRead";

function createLimiter(
  name: string,
  algorithm: ReturnType<typeof Ratelimit.fixedWindow>,
) {
  if (!redis) {
    return null;
  }

  return new Ratelimit({
    redis,
    limiter: algorithm,
    prefix: `${redisKeyPrefix}:ratelimit:${name}`,
    analytics: false,
    timeout: 1200,
  });
}

const limiters = {
  privacyExport: createLimiter("privacy-export", Ratelimit.fixedWindow(20, "10 m")),
  privacyDeletion: createLimiter("privacy-deletion", Ratelimit.fixedWindow(5, "10 m")),
  recoveryCode: createLimiter("recovery-code", Ratelimit.fixedWindow(5, "10 m")),
  avatarUpload: createLimiter("avatar-upload", Ratelimit.fixedWindow(5, "10 m")),
  adminModeration: createLimiter("admin-moderation", Ratelimit.fixedWindow(30, "5 m")),
  ownerRole: createLimiter("owner-role", Ratelimit.slidingWindow(5, "10 m")),
  auth: createLimiter(
    "auth",
    Ratelimit.slidingWindow(90, "10 m"),
  ),

  signup: createLimiter(
    "signup",
    Ratelimit.slidingWindow(25, "30 m"),
  ),

  recovery: createLimiter(
    "recovery",
    Ratelimit.slidingWindow(20, "15 m"),
  ),

  memberSearch: createLimiter(
    "member-search",
    Ratelimit.fixedWindow(40, "1 m"),
  ),

  profileEdit: createLimiter(
    "profile-edit",
    Ratelimit.fixedWindow(12, "10 m"),
  ),

  messageReport: createLimiter("message-report", Ratelimit.fixedWindow(5, "10 m")),
  chatActivity: createLimiter("chat-activity", Ratelimit.fixedWindow(8, "1 m")),
  messageDelivery: createLimiter("message-delivery", Ratelimit.fixedWindow(30, "1 m")),
  messageReaction: createLimiter("message-reaction", Ratelimit.fixedWindow(20, "1 m")),

  messageSend: createLimiter(
    "message-send",
    Ratelimit.slidingWindow(20, "1 m"),
  ),

  conversationOpen: createLimiter(
    "conversation-open",
    Ratelimit.slidingWindow(20, "5 m"),
  ),

  conversationInbox: createLimiter(
    "conversation-inbox",
    Ratelimit.slidingWindow(60, "1 m"),
  ),

  messageHistory: createLimiter(
    "message-history",
    Ratelimit.slidingWindow(90, "1 m"),
  ),

  messageRead: createLimiter(
    "message-read",
    Ratelimit.slidingWindow(60, "1 m"),
  ),
};

function hashIdentifier(
  kind: RateLimitKind,
  trustedSubject: string,
) {
  if (
    typeof trustedSubject !== "string" ||
    trustedSubject.length === 0 ||
    trustedSubject.length > 1024
  ) {
    throw new Error("Invalid rate-limit subject.");
  }

  // Use a keyed hash to avoid storing raw emails,
  // IP addresses, or user identifiers in Redis keys.
  return createHmac(
    "sha256",
    serverEnv.BETTER_AUTH_SECRET,
  )
    .update(kind)
    .update("\0")
    .update(trustedSubject)
    .digest("hex");
}

export async function checkRateLimit(
  kind: RateLimitKind,
  trustedSubject: string,
  failurePolicy: FailurePolicy,
) {
  const identifier = hashIdentifier(
    kind,
    trustedSubject,
  );

  const decision = await evaluateRateLimit(
    limiters[kind],
    identifier,
    failurePolicy,
  );
  if (decision.reason === "unavailable") reportFailure("rate_limit_unavailable");
  return decision;
}
