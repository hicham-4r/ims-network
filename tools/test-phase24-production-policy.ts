import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isRelayActive, socketOrigin, socketLifetimeMs } from "../src/server/realtime/relay-activation-policy";
import { appendRelayNoticeIfEnabled } from "../src/server/realtime/stream-publisher-core";
import { validateUpstashTlsUrl } from "../src/server/realtime/stream-reader-tcp-core";

async function main() {
  const prefix = "ims-network:v1:production";
  const env = { VERCEL_ENV: "production", BETTER_AUTH_URL: "https://example.org", IMS_PHASE16_WS_ENABLED: "true", IMS_PHASE16_RELAY_ENABLED: "true", IMS_PRODUCTION_REALTIME_ENABLED: "true", IMS_PRODUCTION_REDIS_DEDICATED: "true", IMS_PRODUCTION_REDIS_ISOLATION_VERIFIED: "true" };
  const input = { prefix, secret: "fixture".repeat(8), recipientUserId: "fixture-user", eventId: randomUUID(), originInstanceId: randomUUID() };
  let writes = 0;
  const append = async (key: string) => { assert.equal(key, prefix + ":realtime:events"); writes++; return "1-0"; };
  assert.equal(socketOrigin(env), "https://example.org");
  assert.equal(isRelayActive(env, prefix), true);
  assert.equal(socketLifetimeMs(env, prefix), 150000);
  for (const changed of [{IMS_PRODUCTION_REDIS_DEDICATED:"false"},{IMS_PRODUCTION_REALTIME_ENABLED:"false"},{IMS_PRODUCTION_REDIS_ISOLATION_VERIFIED:"false"},{IMS_PHASE16_WS_ENABLED:"false"},{IMS_PHASE16_RELAY_ENABLED:"false"},{BETTER_AUTH_URL:"http://example.org"},{BETTER_AUTH_URL:"https://example.org/path"},{BETTER_AUTH_URL:"https://example.org/"},{VERCEL_ENV:"development"}]) {
    const disabled = {...env,...changed};
    assert.equal(socketOrigin(disabled), null);
    assert.equal(isRelayActive(disabled,prefix),false);
    assert.equal(await appendRelayNoticeIfEnabled(disabled,append,input),false);
  }
  assert.equal(await appendRelayNoticeIfEnabled(env,append,{...input,prefix:"ims-network:v1:preview"}),false);
  assert.equal(writes,0);
  assert.equal(await appendRelayNoticeIfEnabled(env,append,input),true);
  assert.equal(writes,1);
  const scoped = "rediss://ims_production:fixture@mock.upstash.io:6379";
  assert.equal(validateUpstashTlsUrl(scoped,"ims_production"),scoped);
  assert.throws(()=>validateUpstashTlsUrl(scoped));
  assert.throws(()=>validateUpstashTlsUrl("rediss://default:fixture@mock.upstash.io:6379","ims_production"));
  console.log("PHASE24_PRODUCTION_POLICY PASS");
}
void main().catch(error => {console.error(error); process.exitCode=1;});
