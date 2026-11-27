/**
 * Offline-only transparent cost projection. No network calls or credentials.
 * Inputs must come from measurements; defaults should not be treated as facts.
 * Provider plan limits can change: pass a recently verified limit explicitly.
 */
import { RELAY_BLOCK_MS } from "./relay-protocol";

export type RelayBudgetInputs = Readonly<{
  days: number;
  averageConcurrentReaders: number;
  activeReaderHoursPerDay: number;
  publishesPerDay: number;
  otherRedisCommandsPerDay: number;
  averageRecipientSocketsPerNotice: number;
  monthlyCommandLimit: number;
}>;

export type RelayBudgetProjection = Readonly<{
  streamReads: number;
  publishes: number;
  otherCommands: number;
  totalCommands: number;
  estimatedAuthorizationReads: number;
  remainingCommands: number;
  quotaPercent: number;
  severity: "below-review" | "review" | "reduce-optional-traffic" | "over-budget";
}>;

export function projectRelayBudget(i: RelayBudgetInputs): RelayBudgetProjection {
  const nonnegative = [i.averageConcurrentReaders, i.activeReaderHoursPerDay,
    i.publishesPerDay, i.otherRedisCommandsPerDay, i.averageRecipientSocketsPerNotice];
  if (!Number.isSafeInteger(i.days) || i.days < 1 || i.days > 31 ||
      !Number.isSafeInteger(i.monthlyCommandLimit) || i.monthlyCommandLimit < 1 ||
      nonnegative.some((v) => !Number.isFinite(v) || v < 0) ||
      i.activeReaderHoursPerDay > 24 ||
      !Number.isSafeInteger(i.publishesPerDay) ||
      !Number.isSafeInteger(i.otherRedisCommandsPerDay) ||
      !Number.isSafeInteger(i.averageRecipientSocketsPerNotice)) {
    throw new Error("Invalid relay budget inputs.");
  }
  // ceil is intentionally conservative. A reader is active only while a
  // subscriber exists, not while the user is logged in on another page.
  const readsPerActiveReaderDay = Math.ceil(
    i.activeReaderHoursPerDay * 3_600_000 / RELAY_BLOCK_MS,
  );
  const streamReads = Math.ceil(i.days * i.averageConcurrentReaders * readsPerActiveReaderDay);
  const publishes = i.days * i.publishesPerDay;
  const otherCommands = i.days * i.otherRedisCommandsPerDay;
  const totalCommands = streamReads + publishes + otherCommands;
  const estimatedAuthorizationReads = i.days * i.publishesPerDay * i.averageRecipientSocketsPerNotice;
  if (![streamReads, publishes, otherCommands, totalCommands, estimatedAuthorizationReads]
    .every(Number.isSafeInteger)) {
    throw new Error("Relay budget exceeds safe integer range.");
  }
  const quotaPercent = 100 * totalCommands / i.monthlyCommandLimit;
  const severity = quotaPercent >= 100 ? "over-budget" :
    quotaPercent >= 75 ? "reduce-optional-traffic" :
    quotaPercent >= 50 ? "review" : "below-review";
  return {
    streamReads, publishes, otherCommands, totalCommands,
    estimatedAuthorizationReads,
    remainingCommands: i.monthlyCommandLimit - totalCommands,
    quotaPercent, severity,
  };
}
