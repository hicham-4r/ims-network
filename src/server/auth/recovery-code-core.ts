// Pure recovery primitives; no provider or framework dependencies.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_RECORD_PREFIX = "ims-recovery-v1:";
export const RECOVERY_CODE_DAYS = 365;
export const recoveryEnabled = (value: string | undefined) => value === "true";
export function createRecoveryCode(): string { return `IMS1-${randomBytes(32).toString("base64url")}`; }
export function validRecoveryCode(value: unknown): value is string {
  return typeof value === "string" && value.length === 48 && /^IMS1-[A-Za-z0-9_-]{43}$/.test(value);
}
export function validRecoveryPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}
export function recoveryEligible(subject: { userId: string; role: string; status: string; emailVerified: boolean }, ownerId: string | null): boolean {
  return subject.userId !== ownerId && subject.role === "MEMBER" && subject.status === "ACTIVE" && subject.emailVerified === false;
}
function digest(secret: string, domain: string, parts: string[]): string {
  return createHmac("sha256", secret).update(JSON.stringify([domain, ...parts])).digest("hex");
}
export function recoveryIdentifier(secret: string, code: string): string {
  return RECOVERY_RECORD_PREFIX + digest(secret, "code", [code]);
}
export function recoveryBinding(secret: string, userId: string, accountId: string, passwordHash: string, stateVersion: string): string {
  return digest(secret, "binding", [userId, accountId, passwordHash, stateVersion]);
}
export function sameDigest(a: unknown, b: string): boolean {
  return typeof a === "string" && /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
