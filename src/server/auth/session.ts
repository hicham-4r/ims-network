import { reportFailure } from "@/server/observability/safe-events";
import { headers } from "next/headers";

import { auth } from "./auth";

export async function getCurrentSession() {
  try {
    return await auth.api.getSession({
      headers: await headers(),
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
