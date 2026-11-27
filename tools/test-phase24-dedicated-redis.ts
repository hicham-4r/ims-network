import assert from "node:assert/strict";
import { productionRedisAllowed, previewRateLimitAllowed } from "../src/server/redis/access-policy";
import { createPreviewLimiter, previewLimits } from "../src/server/redis/preview-rate-limit-core";
import { evaluateRateLimit } from "../src/server/redis/rate-limit-core";
import { isRelayActive, socketOrigin } from "../src/server/realtime/relay-activation-policy";

async function main() {
  const prod = { VERCEL_ENV: "production", IMS_PRODUCTION_REDIS_DEDICATED: "true", IMS_PRODUCTION_REDIS_ISOLATION_VERIFIED: "true", IMS_PRODUCTION_REALTIME_ENABLED: "true", IMS_PHASE16_WS_ENABLED: "true", IMS_PHASE16_RELAY_ENABLED: "true", BETTER_AUTH_URL: "https://example.org" };
  assert.equal(productionRedisAllowed(prod), true);
  for (const VERCEL_ENV of ["preview", "development", undefined]) {
    const env = { ...prod, VERCEL_ENV };
    assert.equal(productionRedisAllowed(env), false);
    assert.equal(socketOrigin(env), null);
    assert.equal(isRelayActive(env, "ims-network:v1:production"), false);
    assert.equal(isRelayActive(env, "ims-network:v1:preview"), false);
  }
  const host = "ep-preview.c-1.eu-central-1.aws.neon.tech";
  const env = { VERCEL_ENV: "preview", IMS_PREVIEW_DB_RATE_LIMIT_ENABLED: "true", IMS_PREVIEW_RATE_LIMIT_DB_HOST: host,
    DATABASE_URL: `postgresql://fixture:fixture@${host}/neondb?sslmode=require`, DATABASE_URL_POOLED: `postgresql://fixture:fixture@${host.replace("ep-preview", "ep-preview-pooler")}/neondb?sslmode=require` };
  assert.equal(previewRateLimitAllowed(env), true);
  for (const change of [{VERCEL_ENV:"production"}, {IMS_PREVIEW_DB_RATE_LIMIT_ENABLED:"false"}, {DATABASE_URL_POOLED:env.DATABASE_URL}, {DATABASE_URL:env.DATABASE_URL.replace("ep-preview", "ep-other")}, {DATABASE_URL:env.DATABASE_URL.replace("require", "disable")}]) {
    assert.equal(previewRateLimitAllowed({...env,...change}), false);
  }
  const digest = "a".repeat(64);
  let hits = 0;
  const limiter = createPreviewLimiter("messageSend", async (key, limit, seconds) => {
    assert.equal(key, `messageSend:${digest}`); assert.equal(limit, 10); assert.equal(seconds, 60);
    return ++hits <= limit;
  });
  for(let i=0;i<10;i++) assert.equal((await evaluateRateLimit(limiter,digest,"deny")).allowed,true);
  assert.equal((await evaluateRateLimit(limiter,digest,"deny")).reason,"limited");
  assert.equal((await evaluateRateLimit(createPreviewLimiter("auth",async()=>{throw new Error("fixture");}),digest,"deny")).allowed,false);
  assert.equal((await evaluateRateLimit(null,digest,"deny")).allowed,false);
  await assert.rejects(limiter.limit("raw-user"));
  assert.equal(Object.keys(previewLimits).length,20);
  console.log("PHASE24_DEDICATED_REDIS_POLICY PASS");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
