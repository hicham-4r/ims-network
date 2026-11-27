import assert from "node:assert/strict";
import { projectRelayTrialBudget } from "../src/server/realtime/relay-trial-budget";
const example = projectRelayTrialBudget({
 days:30, hoursPerDay:4, activeInstances:2, memoryGbPerInstance:2,
 extraRedisCommandsPerMonth:50_000,
});
assert.equal(example.redisReads, 28_800);
assert.equal(example.totalRedisCommands, 78_800);
assert.equal(example.memoryGbHours, 480);
assert.equal(example.redisUnderFreeCommandCeiling, true);
assert.equal(example.memoryUnderHobbyAllowance, false);
const idle = projectRelayTrialBudget({days:30, hoursPerDay:24,
 activeInstances:4, memoryGbPerInstance:2, extraRedisCommandsPerMonth:0});
assert.equal(idle.redisReads, 345_600);
assert.equal(idle.memoryGbHours, 5760);
assert.throws(() => projectRelayTrialBudget({days:30, hoursPerDay:25,
 activeInstances:1, memoryGbPerInstance:2, extraRedisCommandsPerMonth:0}));
console.log("PASS: Redis/read and Vercel-memory projection catches Hobby excess");
console.log("PHASE 16.19N RELAY TRIAL BUDGET: PASS");
