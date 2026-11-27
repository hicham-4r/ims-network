import { reportFailure } from "@/server/observability/safe-events";
import { serverEnv } from "@/server/env";
import { boundAuthPostBody, validateAuthPostHeaders } from "@/server/auth/http-boundary";
import { authLimitResponse, getTrustedAuthSubject } from "@/server/auth/auth-gate-core";
import { getCurrentSession } from "@/server/auth";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { parsePrivacyRequest, privacyEnabled } from "@/server/privacy/data-policy";
import { exportOwnData, requestOwnDeletion } from "@/server/privacy/data-service";
function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache" } });
}
export async function POST(request: Request) {
  if (!privacyEnabled(process.env.IMS_PRIVACY_DATA_ENABLED)) return reply({ message: "Privacy tools unavailable." }, 503);
  const url = new URL(request.url);
  if (url.pathname !== "/api/privacy-data" || url.search) return reply({ message: "Invalid request." }, 400);
  const invalid = validateAuthPostHeaders(request, serverEnv.BETTER_AUTH_URL);
  if (invalid) return invalid;
  try {
    const bounded = await boundAuthPostBody(request);
    if (bounded instanceof Response) return bounded;
    const input = parsePrivacyRequest(await bounded.json());
    if (!input) return reply({ message: "Invalid request." }, 400);
    const subject = getTrustedAuthSubject(request, process.env.VERCEL_ENV);
    if (!subject) return reply({ message: "Privacy tools unavailable." }, 503);
    const kind = input.action === "export" ? "privacyExport" : "privacyDeletion";
    const ipLimit = authLimitResponse(await checkRateLimit(kind, `ip:${subject}`, "deny"));
    if (ipLimit) return ipLimit;
    const session = await getCurrentSession();
    if (!session) return reply({ message: "Sign in first." }, 401);
    const userLimit = authLimitResponse(await checkRateLimit(kind, `user:${session.user.id}`, "deny"));
    if (userLimit) return userLimit;
    if (input.action === "export") {
      const data = await exportOwnData(session.user.id, session.session.id, input.before);
      return data ? reply(data) : reply({ message: "Export unavailable for this account." }, 403);
    }
    const recorded = await requestOwnDeletion(session.user.id, session.session.id, input.password);
    return recorded ? reply({ requested: true }) : reply({ message: "Request rejected. Check your password and account eligibility." }, 403);
  } catch {
    reportFailure("privacy_failed");
    // No logging of exported data, passwords or provider errors.
    return reply({ message: "Privacy request could not be completed." }, 503);
  }
}
