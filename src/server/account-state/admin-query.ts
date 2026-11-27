// Pure input and pagination helpers; no provider access.
export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_STATUSES = ["UNVERIFIED", "PENDING_APPROVAL", "ACTIVE", "REJECTED", "SUSPENDED"] as const;
export const AUDIT_ACTIONS = ["ACCOUNT_APPROVED", "ACCOUNT_REJECTED", "ACCOUNT_SUSPENDED", "ACCOUNT_RESTORED", "ADMIN_ROLE_GRANTED", "ADMIN_ROLE_REVOKED", "MODERATOR_ROLE_GRANTED", "MODERATOR_ROLE_REVOKED", "RECOVERY_CODE_ROTATED", "RECOVERY_CODE_USED", "ACCOUNT_DELETION_REQUESTED"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AdminParams = Record<string, string | string[] | undefined>;
export class AdminQueryError extends Error {
  constructor() { super("Invalid administration filters or cursor."); }
}
function one(params: AdminParams, name: string, max: number): string {
  const value = params[name];
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new AdminQueryError();
  return value;
}
export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,255}$/.test(value);
}
export function isAdminStatus(value: unknown): value is AdminStatus {
  return ADMIN_STATUSES.some(status => status === value);
}
function isAuditAction(value: unknown): value is AuditAction {
  return AUDIT_ACTIONS.some(action => action === value);
}
export function encodeAdminCursor(parts: readonly string[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}
function decode(raw: string, size: number): string[] {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const decoded: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== size || !decoded.every(x => typeof x === "string")) throw new Error();
    return decoded;
  } catch { throw new AdminQueryError(); }
}
export function parseAccountQuery(params: AdminParams): { q: string; status: AdminStatus | "ALL"; afterId: string | undefined } {
  const q = one(params, "q", 80).trim();
  const rawStatus = params.status === undefined ? "PENDING_APPROVAL" : one(params, "status", 32);
  if (rawStatus !== "ALL" && !isAdminStatus(rawStatus)) throw new AdminQueryError();
  const status = rawStatus;
  const raw = one(params, "cursor", 2048);
  let afterId: string | undefined;
  if (raw) {
    const [kind, boundStatus, boundQ, id] = decode(raw, 4);
    if (kind !== "accounts-v1" || boundStatus !== status || boundQ !== q || !validId(id)) throw new AdminQueryError();
    afterId = id;
  }
  return { q, status, afterId };
}
export function isAuditTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) return false;
  const millisecondIso = value.slice(0, 23) + "Z";
  const date = new Date(millisecondIso);
  return Number.isFinite(date.getTime()) && date.toISOString() === millisecondIso && value.slice(0, 4) !== "0000";
}
export function parseAuditQuery(params: AdminParams): { action: AuditAction | "ALL"; target: string; before: { at: string; id: string } | undefined } {
  const rawAction = params.action === undefined ? "ALL" : one(params, "action", 32);
  if (rawAction !== "ALL" && !isAuditAction(rawAction)) throw new AdminQueryError();
  const action = rawAction;
  const target = one(params, "target", 255);
  if (target && !validId(target)) throw new AdminQueryError();
  const raw = one(params, "cursor", 2048);
  let before: { at: string; id: string } | undefined;
  if (raw) {
    const [kind, boundAction, boundTarget, at, id] = decode(raw, 5);
    if (kind !== "audit-v1" || boundAction !== action || boundTarget !== target || !isAuditTimestamp(at) || !validId(id)) throw new AdminQueryError();
    before = { at, id };
  }
  return { action, target, before };
}
export function escapeSearch(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
export function pageOf<T>(rows: T[], cursor: (last: T) => string) {
  const items = rows.slice(0, ADMIN_PAGE_SIZE);
  return { items, nextCursor: rows.length > ADMIN_PAGE_SIZE ? cursor(items[items.length - 1]) : null };
}
export function isConfirmed(value: unknown): boolean { return value === "yes"; }
