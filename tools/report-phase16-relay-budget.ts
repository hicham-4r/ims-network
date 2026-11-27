import { projectRelayBudget } from "../src/server/realtime/relay-budget";

// Example: npx --no-install tsx .\tools\report-phase16-relay-budget.ts 2 0.5 100 1000 1
// Arguments are reader count, active hours/day, publications/day, other Redis
// commands/day, average recipient sockets/notice. These MUST be measured or
// clearly identified as scenario assumptions, not asserted as real usage.
function parse(index: number, label: string): number {
  const value = Number(process.argv[index]);
  if (process.argv[index] === undefined || !Number.isFinite(value)) {
    throw new Error(`Missing/invalid ${label}. See README for examples.`);
  }
  return value;
}
try {
  const result = projectRelayBudget({
    days: 30,
    averageConcurrentReaders: parse(2, "concurrent readers"),
    activeReaderHoursPerDay: parse(3, "active hours per day"),
    publishesPerDay: parse(4, "publish calls per day"),
    otherRedisCommandsPerDay: parse(5, "other Redis commands per day"),
    averageRecipientSocketsPerNotice: parse(6, "recipient sockets per notice"),
    monthlyCommandLimit: 500_000, // Verify with Upstash pricing before live trial.
  });
  console.log("PROJECTED 30-DAY REDIS USAGE (not measurements)");
  console.log(JSON.stringify(result, null, 2));
  if (result.severity === "over-budget") process.exitCode = 2;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid usage projection.");
  process.exitCode = 1;
}
