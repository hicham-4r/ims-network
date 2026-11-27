/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const requireRepo = createRequire(resolve(process.argv[2], "package.json"));
const { createRelayDiagnosticReporter, classifyRelayTcpFailure } = requireRepo("./src/server/realtime/relay-diagnostics.ts");
let enabled = false, now = 0;
const output = [];
const log = createRelayDiagnosticReporter(() => enabled, (line) => output.push(line), () => now);
log("relay_tcp_connected"); assert.equal(output.length, 0);
enabled = true; log("relay_tcp_connected"); log("relay_tcp_connected"); log("SECRET_NOT_ALLOWED");
assert.equal(output.length, 1); now = 60_000; log("relay_tcp_connected"); assert.equal(output.length, 2);
assert.equal(classifyRelayTcpFailure(new Error("WRONGPASS PRIVATE_TOKEN")), "relay_tcp_auth_failed");
assert.equal(classifyRelayTcpFailure(new Error("TLS certificate error PRIVATE_TOKEN")), "relay_tcp_tls_failed");
assert.equal(classifyRelayTcpFailure(new Error("Connection is closed.")), "relay_tcp_closed");
log(classifyRelayTcpFailure(new Error("unknown PRIVATE_TOKEN")));
assert.ok(!output.join(" ").includes("PRIVATE_TOKEN"));
assert.doesNotThrow(() => createRelayDiagnosticReporter(() => true, () => { throw new Error("sink"); })("relay_enabled"));
console.log("RELAY_DIAGNOSTICS_OFFLINE PASS");
