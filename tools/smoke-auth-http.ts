import assert from "node:assert/strict";

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const configuredOrigin = process.env.BETTER_AUTH_URL;

  if (!configuredOrigin) {
    throw new Error("Local Better Auth URL is missing.");
  }

  const origin = new URL(configuredOrigin);

  if (
    origin.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(
      origin.hostname,
    ) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "Refusing to test a non-local authentication server.",
    );
  }

  const base = origin.origin;

  const sessionResponse = await fetch(
    `${base}/api/auth/get-session`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );

  assert.equal(
    sessionResponse.status,
    200,
    "Anonymous session endpoint must return HTTP 200.",
  );

  console.log("Anonymous session endpoint: PASS");

  // Empty JSON is deliberately invalid.
  // No real credentials or email addresses are used.
  const signInResponse = await fetch(
    `${base}/api/auth/sign-in/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
      },
      body: "{}",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    },
  );

  assert.ok(
    [400, 422].includes(signInResponse.status),
    `Expected validation rejection; received HTTP ${signInResponse.status}.`,
  );

  console.log("Invalid sign-in rejected: PASS");
  console.log("Authentication route reachable: PASS");
  console.log("No account creation or email requested.");
  console.log("AUTHENTICATION HTTP SMOKE TEST PASSED");
}

main().catch((error: unknown) => {
  console.error(
    "Authentication smoke test failed:",
    error instanceof Error
      ? error.message
      : "Unknown error",
  );

  process.exitCode = 1;
});