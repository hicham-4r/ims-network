import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADMIN_PAGE_SIZE, AdminQueryError, encodeAdminCursor, escapeSearch, isAuditTimestamp, isConfirmed, isAdminStatus, pageOf, parseAccountQuery, parseAuditQuery, validId, type AdminStatus, type AuditAction } from "../src/server/account-state/admin-query";

const defaultStatus: AdminStatus | "ALL" = parseAccountQuery({}).status;
assert.equal(defaultStatus, "PENDING_APPROVAL");
const defaultAction: AuditAction | "ALL" = parseAuditQuery({}).action;
assert.equal(defaultAction, "ALL");
assert.equal(parseAccountQuery({ status: "ALL", q: " Alice " }).q, "Alice");
for (const input of [{ status: "ADMIN" }, { q: ["A", "B"] }, { q: "a".repeat(81) }, { q: "a\u0000" }, { cursor: "!" }, { cursor: "a".repeat(2049) }]) {
  assert.throws(() => parseAccountQuery(input), AdminQueryError);
}
const cursor = encodeAdminCursor(["accounts-v1", "ACTIVE", "Alice", "id-20"]);
assert.equal(parseAccountQuery({ status: "ACTIVE", q: "Alice", cursor }).afterId, "id-20");
assert.throws(() => parseAccountQuery({ status: "ACTIVE", q: "Bob", cursor }), AdminQueryError);
assert.throws(() => parseAccountQuery({ status: "ALL", q: "Alice", cursor }), AdminQueryError);
assert.equal(escapeSearch("a%_\\"), "a\\%\\_\\\\");
assert.equal(validId("id-123_ABC"), true);
assert.equal(validId("../admin"), false);
assert.equal(validId(""), false);
assert.equal(isAdminStatus("SECRET"), false);
const rows = Array.from({ length: ADMIN_PAGE_SIZE + 1 }, (_, i) => `id-${i}`);
const page = pageOf(rows, id => id);
assert.equal(page.items.length, 20);
assert.equal(page.nextCursor, "id-19");
assert.equal(pageOf(rows.slice(0, 20), id => id).nextCursor, null);
assert.equal(pageOf([], () => { throw new Error("empty cursor"); }).nextCursor, null);
console.log("PASS: bounded account pagination, filters and literal prefix search");

const at = "2026-11-24T00:00:01.123456Z";
assert.equal(isAuditTimestamp(at), true);
assert.equal(isAuditTimestamp("2026-02-30T00:00:01.123456Z"), false);
assert.equal(isAuditTimestamp("2026-11-24T00:00:01.123Z"), false);
assert.equal(isAuditTimestamp("2026-11-24T24:00:00.123456Z"), false);
const auditCursor = encodeAdminCursor(["audit-v1", "ACCOUNT_APPROVED", "id-123", at, "event-1"]);
assert.deepEqual(parseAuditQuery({ action: "ACCOUNT_APPROVED", target: "id-123", cursor: auditCursor }).before, { at, id: "event-1" });
assert.throws(() => parseAuditQuery({ action: "ALL", target: "id-123", cursor: auditCursor }), AdminQueryError);
assert.throws(() => parseAuditQuery({ action: "ACCOUNT_APPROVED", target: "id-999", cursor: auditCursor }), AdminQueryError);
assert.throws(() => parseAuditQuery({ action: "ADMIN_VIEWED_CONVERSATION" }), AdminQueryError);
assert.throws(() => parseAuditQuery({ target: "../x" }), AdminQueryError);
assert.equal(isConfirmed("yes"), true);
for (const invalid of [true, "true", "on", null, "", ["yes"]]) assert.equal(isConfirmed(invalid), false);
console.log("PASS: audit cursor retains microseconds; confirmation requires explicit yes");

// Structural invariants: these are NOT live database or HTTP authorization tests.
const read = (path: string) => readFileSync(path, "utf8");
const account = read("src/server/account-state/admin-page.ts");
const audit = read("src/server/account-state/admin-audit.ts");
const metrics = read("src/server/account-state/admin-metrics.ts");
const mutation = read("src/server/account-state/admin.ts");
const actions = read("src/app/(app)/admin/accounts/actions.ts");
const controls = read("src/app/(app)/admin/accounts/account-controls.tsx");
for (const source of [account, audit]) {
  assert.match(source, /await requireAdminPage\(\)/);
  assert.match(source, /limit\(ADMIN_PAGE_SIZE \+ 1\)/);
  assert.doesNotMatch(source, /["']use cache["']|messaging-schema|conversationMembers|sessionTable/);
}
assert.ok(account.indexOf("await requireAdminPage()") < account.indexOf("await db.select"));
assert.ok(audit.indexOf("await requireAdminPage()") < audit.indexOf("await db.select"));
assert.match(audit, /desc\(auditLog.createdAt\), desc\(auditLog.id\)/);
assert.match(audit, /AT TIME ZONE 'UTC'/);
assert.doesNotMatch(audit, /metadata:\s*auditLog.metadata/);
assert.match(metrics, /await requireAdminPage\(\);[^]*const counts = await loadCounts\(\)/);
assert.match(metrics, /cacheLife\(\{ stale: 30, revalidate: 30, expire: 60 \}\)/);
assert.match(mutation, /confirmed: z.literal\(true\)/);
assert.match(mutation, /await requireAdmin\(\)/);
assert.match(mutation, /"role" = 'MEMBER'/);
assert.match(mutation, /actor\."role" = 'ADMIN' AND actor\."status" = 'ACTIVE'/);
assert.match(mutation, /actor_session\."id" = \$\{session.session.id\}/);
assert.match(mutation, /INSERT INTO "audit_logs"/);
assert.match(mutation, /DELETE FROM "session"/);
assert.match(actions, /updateTag\(ADMIN_METRICS_TAG\)/);
assert.match(controls, /name="confirmed" value="yes" required/);
assert.match(read("src/app/(public)/privacy/page.tsx"), /not end-to-end encrypted/);
console.log("PASS: offline admin read/mutation/cache/privacy structural guards");
console.log("PHASE 17 ADMIN OFFLINE TESTS: PASS");
