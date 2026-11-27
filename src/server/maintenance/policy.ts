import { createHash, timingSafeEqual } from "node:crypto";

export const MAINTENANCE_BATCH = 200;
export const AUDIT_BATCH = 100;
export const AUDIT_RETENTION_DAYS = 365;
export type MaintenanceMode = "inspect" | "cleanup";
export type MaintenancePolicy = { mode: MaintenanceMode; pruneAudit: boolean };
type Settings = Readonly<Record<string, string | undefined>>;

export function resolveMaintenancePolicy(env: Settings): MaintenancePolicy | null {
  if (env.VERCEL_ENV !== "preview" && env.VERCEL_ENV !== "production") return null;
  const mode = env.IMS_MAINTENANCE_MODE;
  if (mode !== "inspect" && mode !== "cleanup") return null;
  const retention = env.IMS_MAINTENANCE_AUDIT_RETENTION_DAYS;
  if (retention !== undefined && retention !== "" && retention !== "365") return null;
  return { mode, pruneAudit: mode === "cleanup" && retention === "365" };
}

export function isMaintenanceAuthorized(secret: string | undefined, authorization: string | null): boolean {
  if (!secret || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return false;
  if (!authorization || authorization.length > 135 || !authorization.startsWith("Bearer ")) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(authorization), hash(`Bearer ${secret}`));
}

export function boundedCount(value: unknown, maximum: number): number {
  if (typeof value !== "number" && typeof value !== "string") throw new Error("Invalid maintenance result");
  if (typeof value === "string" && !/^\d+$/.test(value)) throw new Error("Invalid maintenance result");
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > maximum) throw new Error("Invalid maintenance result");
  return count;
}
