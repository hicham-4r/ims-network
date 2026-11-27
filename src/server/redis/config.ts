import { Redis } from "@upstash/redis";
import { z } from "zod";
import { productionRedisAllowed } from "./access-policy";

const credentialsSchema = z.object({
  url: z.string().url().refine(
    (value) => new URL(value).protocol === "https:",
    "An HTTPS Redis REST URL is required.",
  ),
  token: z.string().min(1),
});

export function createRedisRuntime(env: NodeJS.ProcessEnv) {
  const namespace =
    env.VERCEL_ENV === "preview"
      ? "preview"
      : env.VERCEL_ENV === "production"
        ? "production"
        : "development";

  const keyPrefix = `ims-network:v1:${namespace}`;

  if (!productionRedisAllowed(env)) {
    return { redis: null as Redis | null, keyPrefix, namespace };
  }

  const hasUrl =
    env.UPSTASH_REDIS_REST_URL !== undefined;

  const hasToken =
    env.UPSTASH_REDIS_REST_TOKEN !== undefined;

  if (!hasUrl && !hasToken) {
    return {
      redis: null as Redis | null,
      keyPrefix,
      namespace,
    };
  }

  if (hasUrl !== hasToken) {
    throw new Error(
      "Redis configuration is incomplete. Both REST variables are required.",
    );
  }

  const result = credentialsSchema.safeParse({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  if (!result.success) {
    throw new Error(
      "Invalid Redis configuration. Check the HTTPS REST URL and token locally.",
    );
  }

  return {
    redis: new Redis({
      url: result.data.url,
      token: result.data.token,
      signal: () => AbortSignal.timeout(3000),
      enableTelemetry: false,
    }),
    keyPrefix,
    namespace,
  };
}