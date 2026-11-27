/** Offline, explicit-assumption cost projection; NOT provider measured billing. */
export const REDIS_FREE_COMMANDS_PER_MONTH = 500_000;
export const HOBBY_MEMORY_GB_HOURS_PER_MONTH = 360;
const XREAD_BLOCK_SECONDS = 30;

export type RelayTrialScenario = Readonly<{
  days: number;
  hoursPerDay: number;
  activeInstances: number;
  memoryGbPerInstance: number;
  extraRedisCommandsPerMonth: number;
}>;

/** Count a read every 30 seconds while an instance is actively subscribed.
 * Multiple tabs on the same instance share the reader. Redis commands from
 * other services are a separate input. Actual limits/usage may change.
 */
export function projectRelayTrialBudget(input: RelayTrialScenario) {
  for (const [name, value] of Object.entries(input)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid budget input: ${name}`);
    }
  }
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 31 ||
      !Number.isInteger(input.activeInstances) || input.activeInstances > 100 ||
      input.hoursPerDay > 24 || input.memoryGbPerInstance > 16 ||
      !Number.isSafeInteger(input.extraRedisCommandsPerMonth)) {
    throw new Error("Budget assumption exceeds reviewed bounds.");
  }
  const hours = input.days * input.hoursPerDay;
  const redisReads = input.activeInstances * Math.ceil(hours * 3600 / XREAD_BLOCK_SECONDS);
  const totalRedisCommands = redisReads + input.extraRedisCommandsPerMonth;
  const memoryGbHours = hours * input.activeInstances * input.memoryGbPerInstance;
  return {
    redisReads,
    totalRedisCommands,
    memoryGbHours,
    redisUnderFreeCommandCeiling: totalRedisCommands <= REDIS_FREE_COMMANDS_PER_MONTH,
    memoryUnderHobbyAllowance: memoryGbHours <= HOBBY_MEMORY_GB_HOURS_PER_MONTH,
  };
}
