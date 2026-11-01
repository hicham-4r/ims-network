import { z } from "zod";

const postgresUrlSchema = z
  .string()
  .min(1, "Database connection URL is required")
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "Must be a PostgreSQL connection URL",
  );

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: postgresUrlSchema,
  DATABASE_URL_POOLED: postgresUrlSchema,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  input: NodeJS.ProcessEnv,
): ServerEnv {
  const result = serverEnvSchema.safeParse({
    NODE_ENV: input.NODE_ENV,
    DATABASE_URL: input.DATABASE_URL,
    DATABASE_URL_POOLED: input.DATABASE_URL_POOLED,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "environment";
        return `${path}: ${issue.message}`;
      })
      .join("; ");

    throw new Error(
      `Invalid server environment configuration: ${details}`,
    );
  }

  return result.data;
}

export const serverEnv = parseServerEnv(process.env);
