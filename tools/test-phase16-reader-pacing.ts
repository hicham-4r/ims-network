import { emptyReadDelayMs, failureRetryDelayMs } from "../src/server/realtime/relay-pacing";
import { RELAY_BLOCK_MS } from "../src/server/realtime/relay-protocol";

function equal(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}
function main() {
  equal(emptyReadDelayMs(0), RELAY_BLOCK_MS, "immediate empty reply never spins");
  equal(emptyReadDelayMs(1_000), 29_000, "early empty reply paced");
  equal(emptyReadDelayMs(30_000), 0, "blocked read no extra delay");
  equal(emptyReadDelayMs(45_000), 0, "long read no extra delay");
  equal(emptyReadDelayMs(Number.NaN), RELAY_BLOCK_MS, "untrusted clock fails conservative");
  console.log("PASS: Idle Redis reader pacing at expected block interval");
  equal(failureRetryDelayMs(1), 1000, "first failure");
  equal(failureRetryDelayMs(2), 2000, "second failure");
  equal(failureRetryDelayMs(8), 120000, "persistent failure cap");
  equal(failureRetryDelayMs(50), 120000, "unbounded failures saturate");
  let rejected = false;
  try { failureRetryDelayMs(0); } catch { rejected = true; }
  equal(rejected, true, "invalid retry budget rejected");
  console.log("PASS: Persistent Redis failures have bounded retry frequency");
  console.log("PHASE 16.19J READER PACING: PASS");
}
main();
