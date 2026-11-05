import "server-only";

import { redis } from "@/server/redis/client";
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

  // Preview has not been provisioned with Redis yet.
  // Preserve existing Preview authentication until
  // environment-isolated Redis is explicitly configured.
  //
  // Better Auth's existing production-mode protection
  // remains in place in Preview.
  if (
    process.env.VERCEL_ENV === "preview" &&
    !redis
  ) {
    return null;
  }

  // When enabled, unavailable Redis fails closed.
  // Production without configured Redis also fails closed.
  return evaluateAuthRequestGate(
    request,
    process.env.VERCEL_ENV,
    checkRateLimit,
  );
}