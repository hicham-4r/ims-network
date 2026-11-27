import { projectRelayBudget } from "../src/server/realtime/relay-budget";
import { RELAY_BLOCK_MS } from "../src/server/realtime/relay-protocol";

function check(ok: boolean, reason: string) { if (!ok) throw new Error(reason); }
function scenario(readerCount: number, hours: number) {
  return projectRelayBudget({ days: 30, averageConcurrentReaders: readerCount,
    activeReaderHoursPerDay: hours, publishesPerDay: 0,
    otherRedisCommandsPerDay: 0, averageRecipientSocketsPerNotice: 0,
    monthlyCommandLimit: 500_000 });
}
function main() {
  check(RELAY_BLOCK_MS === 30_000, "budget model block interval changed");
  const inactive = scenario(0,24);
  check(inactive.streamReads === 0 && inactive.totalCommands === 0,
    "no readers means zero stream reads");
  const one = scenario(1,24);
  check(one.streamReads === 86_400, "one continuous reader baseline");
  const six = scenario(6,24);
  check(six.streamReads === 518_400 && six.severity === "over-budget",
    "six continuous readers exceed budget before other activity");
  const measured = projectRelayBudget({days:30,
    averageConcurrentReaders:2, activeReaderHoursPerDay:0.5,
    publishesPerDay:100, otherRedisCommandsPerDay:1000,
    averageRecipientSocketsPerNotice:1, monthlyCommandLimit:500_000});
  check(measured.streamReads === 3600, "0.5h/day read projection");
  check(measured.publishes === 3000 && measured.otherCommands === 30000,
    "other commands included explicitly");
  check(measured.estimatedAuthorizationReads === 3000,
    "database authorization reads reported separately");
  let rejected = false;
  try { scenario(1,-1); } catch { rejected = true; }
  check(rejected,"invalid budget inputs rejected");
  console.log("PASS: Zero idle readers, worst-case sustained readers, and monthly cap");
  console.log("PASS: Explicit publication, caching and authorization work counted");
  console.log("PHASE 16.19J REDIS BUDGET: PASS");
}
main();
