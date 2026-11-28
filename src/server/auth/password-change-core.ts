// Pure validation shared by the application-owned HTTP operation.
export type PasswordChangeInput = { currentPassword: string; newPassword: string; confirmPassword: string };
export function parsePasswordChange(value: unknown): PasswordChangeInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 3 || !Object.hasOwn(v, "currentPassword") ||
      !Object.hasOwn(v, "newPassword") || !Object.hasOwn(v, "confirmPassword")) return null;
  if (typeof v.currentPassword !== "string" || v.currentPassword.length < 1 || v.currentPassword.length > 128 ||
      typeof v.newPassword !== "string" || v.newPassword.length < 8 || v.newPassword.length > 128 ||
      v.confirmPassword !== v.newPassword || v.currentPassword === v.newPassword) return null;
  return { currentPassword: v.currentPassword, newPassword: v.newPassword, confirmPassword: v.newPassword };
}
