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

  // Preview and Production must use their isolated configured Redis.
  // When enabled, unavailable Redis fails closed.
  // Production without configured Redis also fails closed.
  return evaluateAuthRequestGate(
    request,
    process.env.VERCEL_ENV,
    checkRateLimit,
  );
}