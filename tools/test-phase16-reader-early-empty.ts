import { SharedStreamReader } from "../src/server/realtime/stream-reader-core";

function check(ok: boolean, reason: string) { if (!ok) throw new Error(reason); }
function delay(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
async function waitFor(predicate: () => boolean) {
  for (let n = 0; n < 80; n++) {
    if (predicate()) return;
    await delay(5);
  }
  throw new Error("Timed out waiting for mock stream read");
}
async function main() {
  const recipient = "a".repeat(43);
  let reads = 0;
  let disconnects = 0;
  let connects = 0;
  const reader = new SharedStreamReader(
    "ims-network:v1:preview:realtime:events",
    async () => {
      connects++;
      let closed = false;
      return {
        async read() { reads++; return null; }, // Fault: immediate empty XREAD.
        disconnect() {
          if (closed) return;
          closed = true;
          disconnects++;
        },
      };
    },
    () => { throw new Error("unexpected notice"); },
  );
  check(connects === 0 && reads === 0, "zero Redis IO before subscribe");
  const release = reader.subscribe(recipient);
  await waitFor(() => reads === 1);
  await delay(80);
  check(reads === 1, "early-empty reply must NOT hammer Redis");
  release();
  release();
  await waitFor(() => disconnects === 1);
  check(reader.subscriptionCount() === 0, "last unsubscribe stops reader");
  await delay(50);
  check(reads === 1, "no background Redis commands after last detach");
  console.log("PASS: Immediate empty reads rate-limited and cancelled on detach");
  const reconnect = reader.subscribe(recipient);
  await waitFor(() => reads === 2);
  check(connects === 2, "second active epoch gets one new connection");
  reconnect();
  await waitFor(() => disconnects === 2);
  console.log("PASS: Reader resumes only for new active subscriber");
  console.log("PHASE 16.19J EARLY EMPTY READER: PASS");
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
