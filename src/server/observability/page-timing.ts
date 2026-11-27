import "server-only";
import { connection } from "next/server";

type PageStage = "session" | "account_join" | "account_fallback" | "directory_limit" | "directory_query";

// Preview-only diagnostic sampling, bounded per warm instance. No identifiers,
// request parameters, provider exceptions, credentials or query text are logged.
let windowStart = 0;
let count = 0;

function shouldSample(): boolean {
  if (Math.random() >= 0.1) return false;
  const now = Date.now();
  if (now - windowStart >= 60_000 || now < windowStart) {
    windowStart = now;
    count = 0;
  }
  if (count >= 30) return false;
  count++;
  return true;
}

export function measurePageStage<T>(stage: PageStage, operation: () => Promise<T>): Promise<T> {
  if (process.env.VERCEL_ENV !== "preview" || process.env.IMS_PHASE21_PROFILE !== "true") return operation();
  return (async () => {
    // Sampling uses nondeterministic clocks and randomness. Next.js Cache
    // Components must reach request time before either is accessed. Do not
    // catch the framework's prerender suspension or include this wait in timings.
    await connection();
    if (!shouldSample()) return operation();
    const start = performance.now();
    const report = (outcome: "ok" | "error") => {
      try {
        console.info(JSON.stringify({ component: "ims-network", schema: 1, event: "page_timing", stage, outcome, ms: Math.round(performance.now() - start) }));
      } catch { /* Observability must not change application behavior. */ }
    };
    // Preserve the original result or rejection, including Next.js redirects.
    try {
      const result = await operation();
      report("ok");
      return result;
    } catch (error) {
      report("error");
      throw error;
    }
  })();
}
