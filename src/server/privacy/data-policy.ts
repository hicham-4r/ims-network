// Pure input validation; cursors are positions, never authorization credentials.
export const EXPORT_PAGE_SIZE = 100;
export type PrivacyRequest = { action: "export"; before: string | null } | { action: "request-deletion"; password: string; confirmed: true };
export function privacyEnabled(value: string | undefined) { return value === "true"; }
export function validExportCursor(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
}
export function parsePrivacyRequest(value: unknown): PrivacyRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (v.action === "export" && keys.every(k => k === "action" || k === "before")) {
    if (v.before === null || v.before === undefined) return { action: "export", before: null };
    if (validExportCursor(v.before)) return { action: "export", before: v.before };
  }
  if (v.action === "request-deletion" && keys.every(k => ["action", "password", "confirmed"].includes(k)) &&
      v.confirmed === true && typeof v.password === "string" && v.password.length >= 1 && v.password.length <= 128) {
    return { action: "request-deletion", password: v.password, confirmed: true };
  }
  return null;
}
