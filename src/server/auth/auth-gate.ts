import "server-only";

import { checkRateLimit } from "@/server/redis/rate-limit";

import {
  evaluateAuthRequestGate,
  getAuthLimitKind,
} from "./auth-gate-core";

export async function enforceAuthRateLimit(
  request: Request,
): Promise<Response | null> {
  if (!getAuthLimitKind(request)) {
    return null;
  }

  // Production uses dedicated Redis; protected Preview uses its own PostgreSQL limiter.
  // Unavailable rate limiting fails closed for authentication in both environments.
  return evaluateAuthRequestGate(
    request,
    process.env.VERCEL_ENV,
    checkRateLimit,
  );
}