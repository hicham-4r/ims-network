/** Pure, server-controlled Phase 16 Preview activation decision. No network work. */
export type RelayActivationEnv = Readonly<{
  VERCEL_ENV?: string;
  IMS_PHASE16_WS_ENABLED?: string;
  IMS_PHASE16_RELAY_ENABLED?: string;
}>;

export const WS_ONLY_TRIAL_LIFETIME_MS = 30_000;
export const PREVIEW_RELAY_TRIAL_LIFETIME_MS = 150_000;

export function isPreviewRelayActive(
  env: RelayActivationEnv,
  redisKeyPrefix: string,
): boolean {
  return (
    env.VERCEL_ENV === "preview" &&
    env.IMS_PHASE16_WS_ENABLED === "true" &&
    env.IMS_PHASE16_RELAY_ENABLED === "true" &&
    redisKeyPrefix === "ims-network:v1:preview"
  );
}

/** Longer lease only for explicitly enabled, properly namespaced Preview relay.
 * The WS-only smoke test keeps its proven 30-second lease.
 * Hobby's Function maximum remains a separate platform limit.
 */
export function previewSocketLifetimeMs(
  env: RelayActivationEnv,
  redisKeyPrefix: string,
): typeof WS_ONLY_TRIAL_LIFETIME_MS | typeof PREVIEW_RELAY_TRIAL_LIFETIME_MS {
  return isPreviewRelayActive(env, redisKeyPrefix)
    ? PREVIEW_RELAY_TRIAL_LIFETIME_MS
    : WS_ONLY_TRIAL_LIFETIME_MS;
}
