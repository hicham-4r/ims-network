// Pure role policy. OWNER is a deployment-pinned privilege, never a sign-up role.
export type StoredRole = "MEMBER" | "ADMIN";
export type RoleSubject = { userId: string; role: StoredRole; status: string };
export type RoleChange = "PROMOTE" | "DEMOTE";
export function parseOwnerId(value: string | undefined): string | null {
  return value && /^[A-Za-z0-9_-]{1,255}$/.test(value) ? value : null;
}
export function isOwner(ownerId: string | null, subject: RoleSubject): boolean {
  return ownerId !== null && subject.userId === ownerId && subject.role === "ADMIN" && subject.status === "ACTIVE";
}
export function displayRole(ownerId: string | null, subject: RoleSubject): StoredRole | "OWNER" {
  return isOwner(ownerId, subject) ? "OWNER" : subject.role;
}
export function canChangeRole(ownerId: string | null, actor: RoleSubject, target: RoleSubject, action: RoleChange): boolean {
  if (!isOwner(ownerId, actor) || target.userId === ownerId || target.userId === actor.userId) return false;
  return action === "PROMOTE" ? target.role === "MEMBER" && target.status === "ACTIVE" : action === "DEMOTE" && target.role === "ADMIN";
}
