import "server-only";

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
  | "auth"
  | "signup"
  | "recovery"
  | "memberSearch"
  | "profileEdit"
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

  return evaluateRateLimit(
    limiters[kind],
    identifier,
    failurePolicy,
  );
}