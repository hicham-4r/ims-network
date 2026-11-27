/** Redis is dedicated to Production. Neither Preview nor local Development may connect. */
export type RedisAccessEnv = Readonly<Record<string, string | undefined>>;

export function productionRedisAllowed(env: RedisAccessEnv): boolean {
  return env.VERCEL_ENV === "production" &&
    env.IMS_PRODUCTION_REDIS_DEDICATED === "true" &&
    env.IMS_PRODUCTION_REDIS_ISOLATION_VERIFIED === "true";
}

/** A separate, explicitly pinned Preview Neon database is required for test mutations. */
export function previewRateLimitAllowed(env: RedisAccessEnv): boolean {
  if (env.VERCEL_ENV !== "preview" || env.IMS_PREVIEW_DB_RATE_LIMIT_ENABLED !== "true") return false;
  const host = env.IMS_PREVIEW_RATE_LIMIT_DB_HOST;
  if (!host || !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(host) || /-pooler\./.test(host)) return false;
  const pooledHost = host.replace(/^([^.]+)\./, "$1-pooler.");
  try {
    return [ [env.DATABASE_URL, host], [env.DATABASE_URL_POOLED, pooledHost] ].every(([value, expected]) => {
      const url = new URL(value ?? "");
      return (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
        url.hostname === expected && url.pathname === "/neondb" &&
        !!url.username && !!url.password && (!url.port || url.port === "5432") &&
        ["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "");
    });
  } catch { return false; }
}
