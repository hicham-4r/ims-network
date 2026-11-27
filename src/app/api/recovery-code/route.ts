import { reportFailure } from "@/server/observability/safe-events";
import { serverEnv } from "@/server/env";
import { boundAuthPostBody, validateAuthPostHeaders } from "@/server/auth/http-boundary";
import { getTrustedAuthSubject, authLimitResponse } from "@/server/auth/auth-gate-core";
import { captchaRejection, readCaptchaToken, resolveTurnstileConfig, verifyTurnstile } from "@/server/auth/turnstile-core";
import { getCurrentSession } from "@/server/auth";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { recoveryEnabled, validRecoveryCode, validRecoveryPassword } from "@/server/auth/recovery-code-core";
import { issueRecoveryCode, redeemRecoveryCode } from "@/server/auth/recovery-code-service";

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache" } });
}
const denied = () => reply({ message: "Recovery request rejected. Check your details or try again later." }, 400);
export async function POST(request: Request) {
  if (!recoveryEnabled(process.env.IMS_RECOVERY_CODES_ENABLED)) return reply({ message: "Recovery codes unavailable." }, 503);
  if (new URL(request.url).pathname !== "/api/recovery-code" || new URL(request.url).search) return denied();
  const invalid = validateAuthPostHeaders(request, serverEnv.BETTER_AUTH_URL);
  if (invalid) return invalid;
  try {
    const bounded = await boundAuthPostBody(request);
    if (bounded instanceof Response) return bounded;
    const input: unknown = await bounded.json();
    if (!input || typeof input !== "object" || !("action" in input)) return denied();
    const subject = getTrustedAuthSubject(request, process.env.VERCEL_ENV);
    if (!subject) return reply({ message: "Recovery unavailable." }, 503);
    if (input.action === "issue") {
      if (!("password" in input) || !validRecoveryPassword(input.password)) return denied();
      const ipLimit = authLimitResponse(await checkRateLimit("recoveryCode", `issue-ip:${subject}`, "deny"));
      if (ipLimit) return ipLimit;
      const session = await getCurrentSession();
      if (!session) return reply({ message: "Sign in first." }, 401);
      const accountLimit = authLimitResponse(await checkRateLimit("recoveryCode", `issue-user:${session.user.id}`, "deny"));
      if (accountLimit) return accountLimit;
      const code = await issueRecoveryCode(session.user.id, session.session.id, input.password);
      return code ? reply({ code }) : denied();
    }
    if (input.action !== "redeem" || !("code" in input) || !validRecoveryCode(input.code) ||
      !("password" in input) || !validRecoveryPassword(input.password)) return denied();
    const config = resolveTurnstileConfig(process.env, process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, serverEnv.BETTER_AUTH_URL);
    const token = readCaptchaToken(request);
    if (config.mode === "invalid") return captchaRejection(503);
    if (config.mode !== "disabled" && !token) return captchaRejection(400);
    const limit = authLimitResponse(await checkRateLimit("recoveryCode", `redeem-ip:${subject}`, "deny"));
    if (limit) return limit;
    const challenge = await verifyTurnstile(config, "recovery", token);
    if (challenge) return challenge;
    return await redeemRecoveryCode(input.code, input.password) ? reply({ ok: true }) : denied();
  } catch {
    reportFailure("recovery_failed");
    // Never expose or log request bodies, passwords, code digests or provider errors.
    return reply({ message: "Recovery request could not be completed." }, 503);
  }
}
