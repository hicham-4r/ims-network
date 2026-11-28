// Pure request boundary; no provider or application-state dependencies.
export const MAX_AUTH_BODY_BYTES = 16 * 1024;
const getPaths = new Set(["/api/auth/get-session"]);
const postPaths = new Set([
  "/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/sign-out",
  "/api/auth/get-session", "/api/auth/request-password-reset", "/api/auth/reset-password",
  "/api/auth/password-change",
]);
const emptyBodyPaths = new Set(["/api/auth/sign-out", "/api/auth/get-session"]);

export function isSupportedAuthRequest(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (request.method === "GET") {
    // Better Auth email reset callback; opaque token, not a user-supplied URL.
    return getPaths.has(path) || /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]{1,512}$/.test(path);
  }
  return request.method === "POST" && postPaths.has(path);
}

function reject(status: 400 | 403 | 413 | 415): Response {
  return Response.json({ code: "INVALID_AUTH_REQUEST", message: "Authentication request rejected." }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

export function validateAuthPostHeaders(request: Request, authUrl: string): Response | null {
  if (request.headers.get("origin") !== new URL(authUrl).origin) return reject(403);
  // Do not trust Host or client-forwarded headers as the origin authority.
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) return reject(400);
  if (length !== null && Number(length) > MAX_AUTH_BODY_BYTES) return reject(413);
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") return reject(415);
  if (!request.body && emptyBodyPaths.has(new URL(request.url).pathname)) return null;
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") return reject(415);
  if (!request.body) return reject(400);
  return null;
}

export async function boundAuthPostBody(request: Request): Promise<Request | Response> {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(MAX_AUTH_BODY_BYTES);
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > buffer.length - total) {
        void reader.cancel().catch(() => {});
        return reject(413);
      }
      buffer.set(value, total);
      total += value.byteLength;
    }
  } catch {
    return reject(400);
  } finally {
    reader.releaseLock();
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) !== total) return reject(400);
  const headers = new Headers(request.headers);
  headers.set("content-length", String(total));
  return new Request(request.url, {
    method: request.method, headers, body: buffer.slice(0, total), signal: request.signal,
  });
}
