import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { serverEnv } from "@/server/env";

import * as schema from "./schema";

const client = neon(serverEnv.DATABASE_URL_POOLED);

export const db = drizzle(client, {
  schema,
});
