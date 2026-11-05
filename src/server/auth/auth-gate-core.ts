import { isIP } from "node:net";

import type {
  RateLimitDecision,
} from "../redis/rate-limit-core";

export type AuthLimitKind = "auth" | "signup" | "recovery";

export function getAuthLimitKind(
  request: Request,
): AuthLimitKind | null {
  if (request.method !== "POST") {
    return null;
  }

  const path = new URL(request.url)
    .pathname.replace(/\/+$/, "");

  if (path === "/api/auth/sign-in/email") {
    return "auth";
  }

  if (path === "/api/auth/sign-up/email") {
    return "signup";
  }

  if (
    path === "/api/auth/request-password-reset" ||
    path === "/api/auth/send-verification-email"
  ) {
    return "recovery";
  }

  return null;
}

export function getTrustedAuthSubject(
  request: Request,
  vercelEnv: string | undefined,
): string | null {
  if (
    vercelEnv !== "preview" &&
    vercelEnv !== "production"
  ) {
    // Never trust forwarded headers on a local server.
    return "local-development";
  }

  // Vercel supplies this header from its trusted edge.
  const address = request.headers.get(
    "x-vercel-forwarded-for",
  )?.trim();

  if (!address || isIP(address) === 0) {
    return null;
  }

  return address;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryAfter: number,
): Response {
  return new Response(
    JSON.stringify({
      code,
      message,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
        "X-Retry-After": String(retryAfter),
      },
    },
  );
}

export function authLimitUnavailableResponse() {
  return errorResponse(
    503,
    "RATE_LIMIT_UNAVAILABLE",
    "Authentication is temporarily unavailable. Please try again shortly.",
    30,
  );
}

export function authLimitResponse(
  decision: RateLimitDecision,
): Response | null {
  if (decision.reason === "unavailable") {
    return authLimitUnavailableResponse();
  }

  if (decision.allowed) {
    return null;
  }

  const retryAfter = Math.max(
    1,
    Math.min(3600, decision.retryAfterSeconds ?? 60),
  );

  return errorResponse(
    429,
    "RATE_LIMITED",
    "Too many requests. Please try again later.",
    retryAfter,
  );
}

export async function evaluateAuthRequestGate(
  request: Request,
  vercelEnv: string | undefined,
  check: (
    kind: AuthLimitKind,
    subject: string,
    failurePolicy: "deny",
  ) => Promise<RateLimitDecision>,
): Promise<Response | null> {
  const kind = getAuthLimitKind(request);

  if (!kind) {
    return null;
  }

  const subject = getTrustedAuthSubject(
    request,
    vercelEnv,
  );

  if (!subject) {
    return authLimitUnavailableResponse();
  }

  try {
    // Distinct counters per endpoint, even when
    // multiple endpoints share the same policy.
    // The Redis adapter HMACs this subject.
    const scopedSubject =
      `${subject}:${new URL(request.url).pathname}`;

    const decision = await check(
      kind,
      scopedSubject,
      "deny",
    );

    return authLimitResponse(decision);
  } catch {
    return authLimitUnavailableResponse();
  }
}