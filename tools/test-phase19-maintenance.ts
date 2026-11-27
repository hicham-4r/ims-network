import assert from "node:assert/strict";
import { AUDIT_BATCH, MAINTENANCE_BATCH, boundedCount, isMaintenanceAuthorized, resolveMaintenancePolicy } from "../src/server/maintenance/policy";
const secret = "a".repeat(43);
assert.equal(isMaintenanceAuthorized(secret, `Bearer ${secret}`), true);
for (const input of [null, "", `Bearer ${secret}x`, `bearer ${secret}`, `Basic ${secret}`, "Bearer " + "x".repeat(500)]) {
  assert.equal(isMaintenanceAuthorized(secret, input), false);
}
assert.equal(isMaintenanceAuthorized(undefined, `Bearer ${secret}`), false);
assert.equal(isMaintenanceAuthorized("short", "Bearer short"), false);
assert.equal(resolveMaintenancePolicy({ VERCEL_ENV: "preview" }), null);
assert.equal(resolveMaintenancePolicy({ VERCEL_ENV: "development", IMS_MAINTENANCE_MODE: "cleanup" }), null);
assert.equal(resolveMaintenancePolicy({ VERCEL_ENV: "production", IMS_MAINTENANCE_MODE: "off" }), null);
assert.deepEqual(resolveMaintenancePolicy({ VERCEL_ENV: "preview", IMS_MAINTENANCE_MODE: "inspect", IMS_MAINTENANCE_AUDIT_RETENTION_DAYS: "365" }), { mode: "inspect", pruneAudit: false });
assert.deepEqual(resolveMaintenancePolicy({ VERCEL_ENV: "preview", IMS_MAINTENANCE_MODE: "cleanup" }), { mode: "cleanup", pruneAudit: false });
assert.deepEqual(resolveMaintenancePolicy({ VERCEL_ENV: "production", IMS_MAINTENANCE_MODE: "cleanup", IMS_MAINTENANCE_AUDIT_RETENTION_DAYS: "365" }), { mode: "cleanup", pruneAudit: true });
assert.equal(resolveMaintenancePolicy({ VERCEL_ENV: "production", IMS_MAINTENANCE_MODE: "cleanup", IMS_MAINTENANCE_AUDIT_RETENTION_DAYS: "30" }), null);
assert.equal(boundedCount("200", MAINTENANCE_BATCH), 200);
assert.equal(boundedCount(0, AUDIT_BATCH), 0);
for (const value of [null, false, "", "1e2", -1, 101, 1.5, Infinity]) assert.throws(() => boundedCount(value, AUDIT_BATCH));
console.log("PHASE 19A MAINTENANCE POLICY: PASS");
