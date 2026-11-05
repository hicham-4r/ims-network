import { randomUUID } from "node:crypto";

import { config } from "dotenv";

import { createRedisRuntime } from "../src/server/redis/config";

config({
  path: ".env.local",
  quiet: true,
});

async function main() {
  const runtime = createRedisRuntime(process.env);

  if (runtime.namespace !== "development") {
    throw new Error(
      "This connectivity test is restricted to Development.",
    );
  }

  const redis = runtime.redis;

  if (!redis) {
    throw new Error(
      "Development Redis credentials are not configured.",
    );
  }

  const testKey =
    `${runtime.keyPrefix}:test:connection:${randomUUID()}`;

  const pong = await redis.ping();

  if (pong !== "PONG") {
    throw new Error("Redis PING failed.");
  }

  let keyCreated = false;

  try {
    await redis.set(testKey, "connection-ok", {
      ex: 30,
    });

    keyCreated = true;

    const result = await redis.get<string>(testKey);

    if (result !== "connection-ok") {
      throw new Error("Redis read/write test failed.");
    }
  } finally {
    if (keyCreated) {
      await redis.del(testKey);
    }
  }

  console.log("Redis connection: PASS");
  console.log("Redis PING: PASS");
  console.log("Redis read/write: PASS");
  console.log("Redis cleanup: PASS");
  console.log(`Namespace: ${runtime.namespace}`);
  console.log("No credentials displayed.");
}

main().catch(() => {
  console.error(
    "Redis test failed. Check local configuration and connectivity. Do not share credentials.",
  );
  process.exitCode = 1;
});