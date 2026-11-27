import assert from "node:assert/strict";

import {
  createTlsStreamReadFactory,
  validateUpstashTlsUrl,
  type TcpClient,
  type TcpClientFactory,
  type TcpClientOptions,
} from "../src/server/realtime/stream-reader-tcp-core";
import {
  RELAY_BLOCK_MS,
  RELAY_BATCH_SIZE,
} from "../src/server/realtime/relay-protocol";

const dummyUrl = "rediss://default:dummy-test-only@mock-endpoint.upstash.io:6379";
const stream = "ims-network:v1:preview:realtime:events";

async function main() {
  assert.equal(validateUpstashTlsUrl(dummyUrl), dummyUrl);
  for (const invalid of [
    "redis://default:test@mock-endpoint.upstash.io:6379",
    "rediss://default:test@localhost:6379",
    "rediss://default:test@mock-endpoint.upstash.io",
    "rediss://default:test@mock-endpoint.upstash.io:6379/?secret=yes",
    "rediss://default@mock-endpoint.upstash.io:6379",
    "rediss://default:bad%ZZ@mock-endpoint.upstash.io:6379",
    "not a URL",
  ]) {
    assert.throws(() => validateUpstashTlsUrl(invalid));
  }
  console.log("PASS: TLS and Upstash endpoint validation");

  let built = 0;
  let connected = 0;
  let disconnected = 0;
  let errorListener = false;
  let optionsSeen: TcpClientOptions | null = null;
  const sent: Array<[string, ...Array<string | number>]> = [];

  const factory: TcpClientFactory = (options): TcpClient => {
    built++;
    optionsSeen = options;
    return {
      async connect() { connected++; },
      async call(command, ...args) {
        sent.push([command, ...args]);
        return null;
      },
      disconnect() { disconnected++; },
      onError() { errorListener = true; },
    };
  };

  const connect = createTlsStreamReadFactory(dummyUrl, factory);
  assert.equal(built, 0);
  const reader = await connect();
  assert.equal(built, 1);
  assert.equal(connected, 1);
  assert.equal(errorListener, true);
  assert.ok(optionsSeen);
  if (!optionsSeen) throw new Error("No client options were captured.");
  const options = optionsSeen as TcpClientOptions;
  assert.equal(options.lazyConnect, true);
  assert.equal(options.enableOfflineQueue, true);
  assert.equal(options.protocol, 2);
  assert.equal(options.disableClientInfo, true);
  assert.equal(options.enableReadyCheck, false);
  assert.equal(options.host, "mock-endpoint.upstash.io");
  assert.equal(options.port, 6379);
  assert.equal(options.username, "default");
  assert.equal(options.password, "dummy-test-only");
  assert.deepEqual(options.tls, {
    servername: "mock-endpoint.upstash.io", rejectUnauthorized: true,
  });
  assert.equal(options.autoResendUnfulfilledCommands, false);
  assert.equal(options.maxRetriesPerRequest, 0);
  assert.equal(options.connectTimeout, 8000);
  assert.ok(options.commandTimeout > RELAY_BLOCK_MS);
  assert.equal(options.retryStrategy(), null);
  console.log("PASS: Lazy single connection and bounded retry configuration");

  await reader.read(stream, "$", RELAY_BLOCK_MS, RELAY_BATCH_SIZE);
  assert.deepEqual(sent, [[
    "XREAD", "COUNT", RELAY_BATCH_SIZE, "BLOCK", RELAY_BLOCK_MS,
    "STREAMS", stream, "$",
  ]]);
  console.log("PASS: Exactly one bounded blocking XREAD command");

  await assert.rejects(reader.read("untrusted:stream", "$", RELAY_BLOCK_MS, RELAY_BATCH_SIZE));
  await assert.rejects(reader.read(stream, "$", 0, RELAY_BATCH_SIZE));
  await assert.rejects(reader.read(stream, "$", RELAY_BLOCK_MS, 50000));
  assert.equal(sent.length, 1);
  console.log("PASS: Unbounded or invalid XREAD rejected before network");

  reader.disconnect();
  reader.disconnect();
  assert.equal(disconnected, 1);
  await assert.rejects(reader.read(stream, "$", RELAY_BLOCK_MS, RELAY_BATCH_SIZE));
  console.log("PASS: Idempotent disconnect and read shutdown");

  const failing = createTlsStreamReadFactory(dummyUrl, () => ({
    async connect() { throw new Error("private simulated connect error"); },
    async call() { throw new Error("unexpected"); },
    disconnect() { disconnected++; },
    onError() {},
  }));
  await assert.rejects(failing(), /Realtime Redis TCP connection failed/);
  assert.equal(disconnected, 2);
  console.log("PASS: Connection failure cleaned up without leaking details");
  console.log("PHASE 16 TLS STREAM READER ADAPTER: PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
