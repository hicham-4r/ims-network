import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const originalNodeEnv = process.env.NODE_ENV;

  if (!originalNodeEnv) {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }

  const { checkDatabaseHealth } = await import(
    "../src/server/db/health"
  );

  const health = await checkDatabaseHealth();

  console.log("IMS Network database health:");
  console.table([health]);
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Database health check failed.",
  );

  process.exitCode = 1;
});
