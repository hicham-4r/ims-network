import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  input: NodeJS.ProcessEnv,
): ServerEnv {
  const result = serverEnvSchema.safeParse({
    NODE_ENV: input.NODE_ENV,
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
