import { reportFailure } from "@/server/observability/safe-events";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth/auth";
import { enforceAuthRateLimit } from "@/server/auth/auth-gate";
import { handlePasswordChange } from "@/server/auth/password-change-http";

import { serverEnv } from "@/server/env";
import { captchaRejection, getTurnstileAction, isCanonicalAuthPost, readCaptchaToken, resolveTurnstileConfig, verifyTurnstile } from "@/server/auth/turnstile-core";

import { boundAuthPostBody, isSupportedAuthRequest, validateAuthPostHeaders } from "@/server/auth/http-boundary";

const handlers = toNextJsHandler(auth);

async function safeAuthResponse(call: () => Promise<Response>): Promise<Response> {
  try {
    const response = await call();
    if (response.status >= 500) reportFailure("auth_handler_unavailable");
    return response;
  } catch {
    reportFailure("auth_handler_unavailable");
    return Response.json({ code: "AUTH_UNAVAILABLE", message: "Authentication temporarily unavailable." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}

// Old verification links and resend routes must not revive the removed flow.
function isRemovedVerificationRoute(request: Request): boolean {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  return path === "/api/auth/verify-email" ||
    path === "/api/auth/send-verification-email";
}

function removedVerificationResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  if (isRemovedVerificationRoute(request) || !isSupportedAuthRequest(request)) {
    return removedVerificationResponse();
  }
  return safeAuthResponse(() => handlers.GET(request));
}

export async function POST(request: Request) {
  if (isRemovedVerificationRoute(request) || !isSupportedAuthRequest(request)) {
    return removedVerificationResponse();
  }

  if (!isCanonicalAuthPost(request)) return removedVerificationResponse();
  const invalidHeaders = validateAuthPostHeaders(request, serverEnv.BETTER_AUTH_URL);
  if (invalidHeaders) return invalidHeaders;
  const action = getTurnstileAction(request);
  const config = action ? resolveTurnstileConfig(process.env, process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, serverEnv.BETTER_AUTH_URL) : null;
  const token = action ? readCaptchaToken(request) : null;
  // Reject obvious invalid challenge requests before spending Redis commands.
  if (config?.mode === "invalid") return captchaRejection(503);
  if (config && config.mode !== "disabled" && !token) return captchaRejection(400);

  const rejection = await enforceAuthRateLimit(request);

  if (rejection) {
    return rejection;
  }

  const bounded = await boundAuthPostBody(request);
  if (bounded instanceof Response) return bounded;

  // This application-owned operation never reaches the generic Better Auth handler.
  if (new URL(bounded.url).pathname === "/api/auth/password-change") {
    return handlePasswordChange(bounded);
  }

  if (action && config) {
    const captcha = await verifyTurnstile(config, action, token);
    if (captcha) return captcha;
  }
  return safeAuthResponse(() => handlers.POST(bounded));
}
