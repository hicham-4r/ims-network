import "server-only";
import { getCurrentSession } from "@/server/auth";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { authLimitResponse, authLimitUnavailableResponse, getTrustedAuthSubject } from "./auth-gate-core";
import { reportFailure } from "@/server/observability/safe-events";
import { parsePasswordChange } from "./password-change-core";
import { changeOwnPassword } from "./password-change-service";

function reply(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache" } });
}

// Only invoked after the existing exact-path, origin, content type and body-size gates.
export async function handlePasswordChange(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/api/auth/password-change" || url.search) {
    return reply({ message: "Invalid password change request." }, 400);
  }
  try {
    const subject = getTrustedAuthSubject(request, process.env.VERCEL_ENV);
    if (!subject) return authLimitUnavailableResponse();
    const ipLimit = authLimitResponse(await checkRateLimit("passwordChange", `ip:${subject}`, "deny"));
    if (ipLimit) return ipLimit;
    const input = parsePasswordChange(await request.json().catch(() => null));
    if (!input) return reply({ message: "Use a different password of 8–128 characters and confirm it correctly." }, 400);
    const session = await getCurrentSession();
    if (!session) return reply({ message: "Sign in again before changing your password." }, 401);
    const accountLimit = authLimitResponse(await checkRateLimit("passwordChange", `user:${session.user.id}`, "deny"));
    if (accountLimit) return accountLimit;
    const result = await changeOwnPassword(session.user.id, session.session.id, input);
    if (result === "changed") return reply({ ok: true }, 200);
    if (result === "invalid") return reply({ message: "Check your current password and choose a different new password." }, 400);
    return reply({ message: "Password change denied. Sign in again with an active account." }, 403);
  } catch {
    reportFailure("password_change_failed");
    return reply({ message: "Password change could not be confirmed. Sign in again or try later." }, 503);
  }
}
