import "server-only";

import { createRedisRuntime } from "./config";

const runtime = createRedisRuntime(process.env);

export const redis = runtime.redis;
export const redisKeyPrefix = runtime.keyPrefix;
export const redisNamespace = runtime.namespace;