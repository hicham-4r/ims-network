import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth/auth";
import { enforceAuthRateLimit } from "@/server/auth/auth-gate";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const rejection = await enforceAuthRateLimit(request);

  if (rejection) {
    return rejection;
  }

  return handlers.POST(request);
}