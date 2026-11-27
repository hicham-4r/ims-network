/** Shared server-controlled activation decision. No network work. */
import { productionRedisAllowed } from "../redis/access-policy";
export type RelayActivationEnv = Readonly<{
  [key: string]: string | undefined;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  BETTER_AUTH_URL?: string;
  IMS_PHASE16_WS_ENABLED?: string;
  IMS_PHASE16_RELAY_ENABLED?: string;
  IMS_PRODUCTION_REALTIME_ENABLED?: string;
  IMS_PRODUCTION_REDIS_ISOLATION_VERIFIED?: string;
}>;

export const WS_ONLY_TRIAL_LIFETIME_MS = 30_000;
export const PREVIEW_RELAY_TRIAL_LIFETIME_MS = 150_000;

function productionOrigin(env: RelayActivationEnv): string | null {
  if (!productionRedisAllowed(env) || env.IMS_PRODUCTION_REALTIME_ENABLED !== "true") return null;
  try {
    const u = new URL(env.BETTER_AUTH_URL ?? "");
    return u.protocol === "https:" && !u.port && !u.username && !u.password &&
      u.pathname === "/" && !u.search && !u.hash && u.hostname.includes(".") &&
      env.BETTER_AUTH_URL === u.origin ? u.origin : null;
  } catch { return null; }
}

export function socketOrigin(env: RelayActivationEnv): string | null {
  if (env.IMS_PHASE16_WS_ENABLED !== "true") return null;
  if (env.IMS_PHASE16_RELAY_ENABLED !== "true") return null;
  return productionOrigin(env);
}

export function isRelayActive(env: RelayActivationEnv, redisKeyPrefix: string): boolean {
  if (env.IMS_PHASE16_WS_ENABLED !== "true" || env.IMS_PHASE16_RELAY_ENABLED !== "true") return false;
  return redisKeyPrefix === "ims-network:v1:production" && productionOrigin(env) !== null;
}

export function socketLifetimeMs(env: RelayActivationEnv, redisKeyPrefix: string): typeof WS_ONLY_TRIAL_LIFETIME_MS | typeof PREVIEW_RELAY_TRIAL_LIFETIME_MS {
  return isRelayActive(env, redisKeyPrefix) ? PREVIEW_RELAY_TRIAL_LIFETIME_MS : WS_ONLY_TRIAL_LIFETIME_MS;
}

// Historical exports retained for existing regression consumers.
export const isPreviewRelayActive = isRelayActive;
export const previewSocketLifetimeMs = socketLifetimeMs;
