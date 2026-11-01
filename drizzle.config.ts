import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { z } from "zod";

config({ path: ".env.local" });

const databaseUrl = z
  .string()
  .min(1, "DATABASE_URL is required")
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must be a PostgreSQL connection URL",
  )
  .parse(process.env.DATABASE_URL);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
