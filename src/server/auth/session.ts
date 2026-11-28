import { reportFailure } from "@/server/observability/safe-events";
import { headers } from "next/headers";
import { connection } from "next/server";

import { auth } from "./auth";

export async function getCurrentSession() {
  // Do not start the database lookup during Cache Components prerendering.
  // Keep Next.js request-time control flow outside the provider-error catch.
  await connection();
  const requestHeaders = await headers();
  try {
    return await auth.api.getSession({
      headers: requestHeaders,
    });
  } catch {
    reportFailure("session_lookup_failed");
    throw new Error("Session lookup temporarily unavailable.");
  }
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireAuthenticatedSession() {
  const session = await getCurrentSession();

  if (!session) {
    throw new AuthenticationRequiredError();
  }

  return session;
}
