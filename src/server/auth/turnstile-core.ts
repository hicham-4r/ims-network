// No database, Redis, or Next.js dependency: testable with a fake verifier.
export type TurnstileAction = "signup" | "recovery";
export type TurnstileConfig =
  | { mode: "disabled" | "invalid" }
  | { mode: "real" | "test"; secret: string; hostname: string };

const testSiteKeys = new Set([
  "1x00000000000000000000AA", "2x00000000000000000000AB",
  "1x00000000000000000000BB", "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);
const testSecrets = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export function resolveTurnstileConfig(
  env: NodeJS.ProcessEnv, siteKey: string | undefined, authUrl: string,
): TurnstileConfig {
  const secret = env.TURNSTILE_SECRET_KEY;
  const local = !env.VERCEL_ENV && ["development", "test"].includes(env.NODE_ENV ?? "");
  const explicitTest = env.IMS_TURNSTILE_TEST_MODE === "true";
  // Only ordinary local development may omit BOTH keys. Deployed requests fail closed.
  if (local && !siteKey && !secret && !explicitTest) return { mode: "disabled" };
  if (!siteKey || !secret || siteKey !== siteKey.trim() || secret !== secret.trim()) return { mode: "invalid" };
  let hostname: string;
  try { hostname = new URL(authUrl).hostname; } catch { return { mode: "invalid" }; }
  const testSite = testSiteKeys.has(siteKey);
  const testSecret = testSecrets.has(secret);
  // Explicit test mode only in local development or an isolated, protected Preview.
  if (explicitTest || testSite || testSecret || /^[123]x/.test(siteKey) || /^[123]x/.test(secret)) {
    if (explicitTest && (local || env.VERCEL_ENV === "preview") && testSite && testSecret) {
      return { mode: "test", secret, hostname };
    }
    return { mode: "invalid" };
  }
  return { mode: "real", secret, hostname };
}

export function getTurnstileAction(request: Request): TurnstileAction | null {
  if (request.method !== "POST") return null;
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/sign-up/email") return "signup";
  if (path === "/api/auth/request-password-reset") return "recovery";
  return null;
}

// Only canonical POST endpoint paths reach the auth handler. No encoded path,
// trailing slash or duplicate slash variant may skip the two auth gates.
export function isCanonicalAuthPost(request: Request): boolean {
  return request.method !== "POST" || /^\/api\/auth\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(new URL(request.url).pathname);
}

export function captchaRejection(status: 400 | 403 | 503): Response {
  return Response.json({ code: "CAPTCHA_REQUIRED", message: status === 503
    ? "Registration or recovery is temporarily unavailable."
    : "Complete a new security challenge and try again." }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

export function readCaptchaToken(request: Request): string | null {
  const token = request.headers.get("x-captcha-response");
  return token && token.length <= 2048 && /^[A-Za-z0-9._~-]+$/.test(token) ? token : null;
}

export async function verifyTurnstile(
  config: TurnstileConfig, action: TurnstileAction, token: string | null,
  fetcher: typeof fetch = fetch,
): Promise<Response | null> {
  if (config.mode === "disabled") return null;
  if (config.mode === "invalid") return captchaRejection(503);
  if (!token) return captchaRejection(400);
  // The discriminated type guard is intentionally explicit.
  if (config.mode !== "real" && config.mode !== "test") return captchaRejection(503);
  try {
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret: config.secret, response: token }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return captchaRejection(503);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("success" in result) || result.success !== true) return captchaRejection(403);
    if (config.mode === "real" && (!("hostname" in result) || result.hostname !== config.hostname ||
      !("action" in result) || result.action !== action)) return captchaRejection(403);
    // Cloudflare's documented dummy response has neither real hostname nor action.
    return null;
  } catch {
    // Never log the raw response, token, secret or provider exception.
    return captchaRejection(503);
  }
}
