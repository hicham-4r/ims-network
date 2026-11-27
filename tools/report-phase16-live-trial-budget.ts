import { projectRelayTrialBudget } from "../src/server/realtime/relay-trial-budget";

const scenarios = [
  { label: "one instance, 1h/day", activeInstances:1, hoursPerDay:1 },
  { label: "two instances, 4h/day", activeInstances:2, hoursPerDay:4 },
  { label: "four instances, 24h/day", activeInstances:4, hoursPerDay:24 },
];
for (const x of scenarios) {
  const r = projectRelayTrialBudget({
    days:30, hoursPerDay:x.hoursPerDay, activeInstances:x.activeInstances,
    memoryGbPerInstance:2, extraRedisCommandsPerMonth:50_000,
  });
  console.log(`${x.label}: reader XREAD=${r.redisReads}, total redis including assumed` +
    ` 50k other commands=${r.totalRedisCommands}, memory GB-hours=${r.memoryGbHours}` +
    `, under ceilings(redis/memory)=${r.redisUnderFreeCommandCeiling}/${r.memoryUnderHobbyAllowance}`);
}
console.log("Model ONLY: change 2GB and 50k placeholders to real usage and check current provider docs.");
